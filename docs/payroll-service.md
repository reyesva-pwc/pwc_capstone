# payroll-service (Node.js / Express) - port 3001

## In one sentence

The service that **runs payroll**: it finds out an employee's salary, adds overtime, subtracts Philippine contributions and tax, saves the result, and also keeps **employee photos** in Amazon S3.

## Three jobs

| Job | What happens |
|---|---|
| 1. Run payroll | Look up the employee, calculate pay and deductions, save the run |
| 2. Payroll history | List saved runs and export one as a CSV file |
| 3. Employee photos | Upload / list / delete photos in a private S3 bucket |

It also has a small **AWS check** (`/api/aws/identity`) that shows whether AWS is connected.

**Who may do what.** Every `/api/...` call must carry a sign-in token (a signed JWT issued by employee-service). This service keeps no user accounts and does not call anyone to check the token: it verifies the signature itself with a shared secret. Members can read; **admins** are needed to run payroll, change photos and check AWS.

## The restaurant, applied

Same layers as the other services, with different file names:

| Restaurant | Folder | Examples |
|---|---|---|
| Menu (which URL goes where) | `routes/` | `payroll.routes.js` |
| Waiter | `controllers/` | `payroll.controller.js` |
| Head chef | `services/` | `payroll.service.js`, `ph-deductions.js` |
| Storeroom clerk | `repositories/` | `payroll.repository.js` (a JSON file), `image.repository.js` (S3) |
| Doorman | `middleware/auth.js` | checks the sign-in token, and whether the user is an admin |
| Kitchen rules / helpers | `config/`, `middleware/`, `utils/` | settings, error catcher, error type |

```
Browser
   |
   v
routes  ->  controllers  ->  services  ->  repositories
(menu)      (waiter)         (chef)        (storeroom)
                                |
                                +--> employee.client.js --> employee-service
                                |    (phone call to ask "what is this salary?")
                                +--> ph-deductions.js (the tax & contributions maths)
```

## What the API offers

| Method | URL | Who | What it does | Answers |
|---|---|---|---|---|
| GET | `/health` | anyone | Is the service alive? | 200 |
| GET | `/api/payroll` | signed in | List saved payroll runs | 200, 401 |
| POST | `/api/payroll/run` | **admin** | Calculate and save a run | 201, 400, 401, 403, 404, 409, 502 |
| GET | `/api/payroll/{id}/export` | signed in | Download one run as CSV | 200, 401, 404 |
| GET | `/api/aws/identity` | **admin** | Show AWS connection status | 200, 401, 403, 503 |
| GET | `/api/employee-images` | signed in | Map of employee id to photo link | 200, 401, 503 |
| PUT | `/api/employee-images/{employeeId}` | **admin** | Upload / replace a photo | 200, 400, 401, 403, 404, 413, 502, 503 |
| DELETE | `/api/employee-images/{employeeId}` | **admin** | Delete a photo | 204, 400, 401, 403, 503 |

"Signed in" means a valid token in the `Authorization: Bearer ...` header. **401** means missing or expired token; **403** means a member tried an admin action.

Every error looks like `{"error": "message"}`.

## Folder map

```
payroll-service/
├── server.js                   start button
├── .env                        your private settings (not in git)
├── data/payroll-runs.json      the saved payroll history
└── src/
    ├── app.js                  builds the web app
    ├── config/index.js         reads settings once
    ├── routes/                 URL -> controller
    ├── controllers/            HTTP in/out
    ├── services/               rules and calculations
    ├── repositories/           file and S3 access
    ├── middleware/auth.js            the doorman: token check, admin check
    ├── middleware/error-handler.js   last-resort error catcher
    └── utils/http-error.js     an error that knows its HTTP status
```

## The `.env` settings

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | 3001 | Port to listen on |
| `EMPLOYEE_SERVICE_URL` | `http://localhost:8081` | Where to ask about employees |
| `AWS_ENABLED` | false | Must be `true` to use S3. Otherwise the service is in "offline mode" |
| `AWS_REGION` | us-east-1 | Region of the bucket |
| `AWS_S3_BUCKET` | (empty) | Name of the bucket for photos |
| `JWT_SECRET` | (none, **required**) | The shared signing secret, at least 32 characters. Must be **identical** in employee-service and ai-service. The service refuses to start without it |

AWS passwords/keys are **never** in `.env`. The AWS toolkit finds them on your computer (`~/.aws/credentials`).

---

# File by file

## 1. `server.js` - the start button

```js
const config = require('./src/config');
const app = require('./src/app');

app.listen(config.port, () => {
  console.log(`Payroll service listening on port ${config.port}`);
  console.log(`AWS: ${config.aws.enabled ? 'enabled' : 'OFFLINE (AWS_ENABLED is not true)'} | S3 bucket: ${config.aws.s3Bucket || '(none)'}`);
});
```

- It only **starts listening**. The app itself is built in `src/app.js`.
- The second message is a debugging aid: it tells you immediately whether the `.env` file was read and whether AWS is on.

## 2. `src/config/index.js` - the settings in one place

```js
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const jwtSecret = process.env.JWT_SECRET || '';
if (Buffer.byteLength(jwtSecret) < 32) {
  throw new Error('JWT_SECRET is missing or shorter than 32 characters. ...');
}

module.exports = {
  jwtSecret,
  jwtIssuer: 'payroll-capstone-employee-service',
  jwtAudience: 'payroll-capstone',
  port: Number(process.env.PORT || 3001),
  employeeServiceUrl: (process.env.EMPLOYEE_SERVICE_URL || 'http://localhost:8081').replace(/\/$/, ''),
  corsOrigin: 'http://localhost:5173',
  bodyLimit: '32kb',
  ...
  aws: { enabled: ..., region: ..., s3Bucket: ... },
  imageMaxBytes: 2 * 1024 * 1024,
  imageUrlTtlSeconds: 300
};
```

- `dotenv` reads the `.env` file into the program. We give it the **exact file path**, so it works no matter which folder you start the program from.
- **The secret check runs at start-up.** If `JWT_SECRET` is missing or shorter than 32 bytes, the program stops with a clear message instead of starting in a state where anyone could forge a token. This is why a service that "won't start" after the JWT change usually just needs the `.env` line.
- `jwtIssuer` and `jwtAudience` are the two text values employee-service writes into every token. They are checked on every request so a token made for something else is refused.
- `process.env.PORT || 3001` means "use the setting, otherwise this default".
- Other files read from this one object, so a setting is never hard-coded in several places.
- Notable limits: JSON requests up to 32 KB; photos up to **2 MB**; photo links last **300 seconds (5 minutes)**.
- AWS is only on when `AWS_ENABLED` is the word `true`.

## 3. `src/app.js` - assembling the app

```js
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: config.bodyLimit }));
app.use(routes);
app.use(errorHandler);
```

Each `app.use` adds a step that every request passes through, **in this order**:
1. `cors`: allow the React app (port 5173) to call us from the browser.
2. `express.json`: read a JSON request body into a JavaScript object (max 32 KB).
3. `routes`: find the matching URL.
4. `errorHandler`: placed **last** so it catches anything that went wrong above.

## 4. `src/routes/` - the menu

Routes do one thing: connect a URL and method to a controller function.

```js
// payroll.routes.js
router.get('/', controller.list);
router.post('/run', controller.run);
router.get('/:id/export', controller.exportCsv);
```

`index.js` attaches each group under its prefix, and puts the **doorman** in front of everything under `/api`:

```js
router.use('/health', require('./health.routes'));
router.use('/api', requireUser);
router.use('/api/payroll', require('./payroll.routes'));
router.use('/api/aws', require('./aws.routes'));
router.use('/api/employee-images', require('./image.routes'));
```

- Order matters. `/health` comes first, so it stays open (a monitoring tool should not need to sign in).
- `router.use('/api', requireUser)` makes every request to a URL starting with `/api` pass the token check **before** it reaches any of the three groups below it.
- The admin-only routes add a second check, `requireAdmin`, right on the route:

```js
router.post('/run', requireAdmin, controller.run);            // payroll.routes.js
router.get('/identity', requireAdmin, controller.identity);   // aws.routes.js
router.put('/:employeeId', requireAdmin, rawImage, controller.upload, imageBodyErrors);   // image.routes.js
router.delete('/:employeeId', requireAdmin, controller.remove);
```

In Express a route lists its steps in order. Each step either calls `next()` to continue or answers the request itself. `requireAdmin` sits **before** `rawImage`, so a member's photo is rejected (403) before the server even reads the upload.

The photo route is the interesting one:

```js
const rawImage = express.raw({ type: () => true, limit: config.imageMaxBytes });

router.put('/:employeeId', rawImage, controller.upload, imageBodyErrors);
```

- A photo is not JSON, it is raw bytes. `express.raw` reads the body **as bytes**, accepting any content type, because we check the real type later by looking inside the file.
- The 2 MB limit is applied here. Anything bigger triggers `imageBodyErrors`, which answers **413** with a friendly message.

The three routes in the order they run:

```js
router.get('/', controller.list);
router.put('/:employeeId', rawImage, controller.upload, imageBodyErrors);
router.delete('/:employeeId', controller.remove);
```

- `PUT` has a chain: `rawImage` reads the body, then `controller.upload` handles it, and `imageBodyErrors` sits **last** so it can catch a problem raised by either step. In Express, a function with four parameters is an error catcher.
- `GET /` returns the whole photo list. `DELETE /:employeeId` removes one photo. Neither needs a body reader.

And the error catcher itself:

```js
function imageBodyErrors(error, _req, res, next) {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: `Image must be ${config.imageMaxBytes / 1024 / 1024} MB or smaller` });
  }
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  return next(error);
}
```

- `error.type === 'entity.too.large'` is how the body reader says "this was over the limit". The message is built from the setting, so it always says the real number of MB (2).
- A known `HttpError` is answered with its own status.
- Anything else is handed on with `next(error)`, and ends at the global safety net (500).

One thing to know: the global JSON reader runs before the routes. If a client sends a photo with `Content-Type: application/json`, that reader would consume the body first, so the upload would see no bytes and answer 400. Browsers send `image/png` or similar, so the app is not affected.

## 5. `src/utils/http-error.js` - an error that knows its status

```js
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
```

Lets the chef say `throw new HttpError(404, 'Employee not found')`. The waiter then turns that into the right HTTP answer. The chef decides *what* went wrong; the waiter decides *how to say it over HTTP*.

## 5b. `src/middleware/auth.js` - the doorman

This service has no password list and **does not call anyone to check a token**. The token is a signed JWT, and this file verifies the signature itself, using the secret it shares with employee-service.

```js
function bearerToken(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(\S{1,2048})$/i.exec(header);
  return match ? match[1] : null;
}
```

- Reads the `Authorization: Bearer <token>` header. The pattern accepts the word `Bearer`, then one token of 1 to 2,048 non-space characters (a JWT is longer than the old random token, which is why the limit grew). Anything else gives `null`.

```js
const jwt = require('jsonwebtoken');

function requireUser(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  try {
    const claims = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });
    if (!claims.sub || !claims.email || !claims.role) return res.status(401).json({ error: 'Sign in required' });
    req.user = { id: Number(claims.sub), emailAddress: claims.email, role: claims.role };
    req.token = token;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Sign in required' });
  }
}
```

Line by line:
- A **middleware** is a function that runs before the real handler. `next()` means "carry on"; answering with `res.status(...)` means "stop here".
- `OPTIONS` requests pass: the browser sends a "may I?" check first (CORS), and it cannot carry the token.
- **No token: 401.**
- `jwt.verify(token, secret, options)` does the real work. It recomputes the signature with the shared secret and compares, and it also checks that the token has not expired. It **throws** if anything is wrong:
  - `algorithms: ['HS256']` accepts only that signing method, so a forged token cannot ask for "no signature" or a weaker one.
  - `issuer` and `audience` must match the values employee-service puts in the token, so a token made for another app is refused.
- One `catch` covers every failure (bad signature, expired, malformed, wrong issuer) and answers **401** with the same message. The caller learns nothing about *why*.
- On success the claims become the user: `sub` is the id, plus `email` and `role`. They are stored on the request as `req.user`. The raw token is kept as `req.token` so it can be forwarded (see `employee.client.js`).
- **No network call.** The old version asked employee-service about every request and answered 502 when it was down. Now the check is local and instant, so this service keeps working for signed-in users even while employee-service is down (only the calls that need employee data fail, with 502).

```js
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  return next();
}
```

- Runs **after** `requireUser`, so `req.user` is already set. A member gets **403** ("I know who you are, but you may not").
- Because the token is checked locally, a user who "logs out" (the browser forgets the token) or whose password is reset is **not** cut off here until the token expires. That is the price of not asking anyone. See the Q&A.

## 6. `src/middleware/error-handler.js` - the safety net

```js
function errorHandler(error, _req, res, _next) {
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'Internal server error' });
}
```

Catches anything unexpected. The real reason is **logged on the server**, but the user only sees a generic 500, so internal details never leak. (It must have four parameters; that is how Express recognises an error handler.)

## 7. `src/controllers/payroll.controller.js` - the waiter

```js
async function run(req, res, next) {
  try {
    res.status(201).json(await service.runPayroll(req.body, req.token));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error.cause || error.name === 'TypeError') return res.status(502).json({ error: 'Employee service unavailable' });
    next(error);
  }
}
```

- Success: answer **201** with the new payroll record.
- A known `HttpError` (invalid input, duplicate, employee not found): answer with the status the chef chose.
- A network failure (employee-service is turned off) shows up as a `TypeError` or an error with a `cause`: answer **502** ("a service behind me failed").
- Anything else goes to `next(error)` and ends at the safety net (500).
- `list` and `exportCsv` follow the same pattern. `exportCsv` uses `res.type('text/csv').attachment(filename)` so the browser downloads a file.

`image.controller.js` follows the same pattern for photos (a small `fail` helper does the same error mapping). `aws.controller.js` is described below.

## 8. `src/services/employee.client.js` - the phone call to employee-service

```js
async function fetchEmployee(employeeId, token) {
  const response = await fetch(`${config.employeeServiceUrl}/api/employees/${encodeURIComponent(Number(employeeId))}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) throw new HttpError(404, 'Employee not found');
  if (response.status === 401) throw new HttpError(401, 'Sign in required');
  if (!response.ok) throw new HttpError(502, 'Employee service unavailable');
  return response.json();
}
```

- Asks employee-service for one employee. Used by running payroll and saving a photo.
- **The caller's own token is passed along** (`token` comes from `req.token`, set by the doorman). employee-service now refuses unsigned requests, so this service acts on behalf of whoever is signed in, rather than holding a master key.
- 404 from them means 404 for our caller; 401 means the token stopped being valid; any other failure means "the other service has a problem": 502.
- `await` means "wait for the answer before continuing" (the call goes over the network).
- The token travels down the chain: controller (`req.token`) -> service (`runPayroll(body, token)`) -> this client. That is why those functions gained a `token` parameter.

## 9. `src/services/ph-deductions.js` - the Philippine tax maths

This file turns a salary into the contributions and tax. The numbers at the top are the **rules**; the functions apply them. All figures are **monthly, employee share**.

```js
const SSS = { rate: 0.05, minCredit: 5000, maxCredit: 35000, step: 500 };
const PHILHEALTH = { rate: 0.025, floor: 10000, ceiling: 100000 };
const PAGIBIG = { rate: 0.02, lowRate: 0.01, lowThreshold: 1500, maxFundSalary: 10000 };
```

| Contribution | Plain rule | Code |
|---|---|---|
| **SSS** (social security) | 5% of the salary rounded to the nearest 500, but never based on less than 5,000 or more than 35,000 | `sssContribution` |
| **PhilHealth** (health insurance) | 2.5% of the salary, counting the salary as at least 10,000 and at most 100,000 | `philhealthContribution` |
| **Pag-IBIG** (housing fund) | 2% of the salary, counting at most 10,000 (so never more than 200) | `pagibigContribution` |

```js
function sssContribution(monthlySalary) {
  const credit = Math.min(SSS.maxCredit, Math.max(SSS.minCredit, Math.round(monthlySalary / SSS.step) * SSS.step));
  return round2(credit * SSS.rate);
}
```

- `Math.max(low, x)` lifts `x` up to a minimum; `Math.min(high, x)` caps it at a maximum. Combined they **clamp** a number into a range.
- `Math.round(salary / 500) * 500` rounds to the nearest 500.

### The income tax

```js
const TAX_BRACKETS = [
  { from: 20833, base: 0,         rate: 0.15 },
  { from: 33333, base: 1875,      rate: 0.20 },
  { from: 66667, base: 8541.80,   rate: 0.25 },
  { from: 166667, base: 33541.80, rate: 0.30 },
  { from: 666667, base: 183541.80, rate: 0.35 }
];

function withholdingTax(taxableIncome) {
  const bracket = [...TAX_BRACKETS].reverse().find(item => taxableIncome > item.from);
  if (!bracket) return 0;
  return round2(bracket.base + bracket.rate * (taxableIncome - bracket.from));
}
```

**How to read the table.** Tax is progressive: the more you earn, the higher the rate on the *extra* part. Each row says "if taxable income is above `from`, tax = `base` + `rate` x (the amount above `from`)".

- `reverse().find(...)` checks from the highest bracket downward and picks the first one the income exceeds.
- Taxable income of 20,833 or less: no bracket matches, so **tax is 0**.

### Putting it together

```js
function computeDeductions({ baseSalary, grossPay, otherDeductions }) {
  const sss = sssContribution(baseSalary);
  const philhealth = philhealthContribution(baseSalary);
  const pagibig = pagibigContribution(baseSalary);
  const totalContributions = round2(sss + philhealth + pagibig);
  const taxableIncome = round2(Math.max(0, grossPay - totalContributions));
  const tax = withholdingTax(taxableIncome);
  const other = round2(otherDeductions);
  const totalDeductions = round2(totalContributions + tax + other);
  return { sss, philhealth, pagibig, totalContributions, taxableIncome, withholdingTax: tax, otherDeductions: other, totalDeductions };
}
```

The order matters, and it follows how real payroll works:
1. Contributions are based on the **basic salary**.
2. **Taxable income = gross pay minus the contributions** (contributions are tax-free money).
3. Tax is computed on that taxable income.
4. `other` is whatever extra deductions the user typed in.
5. Total deductions = contributions + tax + other.

`round2` rounds to 2 decimals so peso amounts never show tiny fractions:
`Math.round((value + Number.EPSILON) * 100) / 100`.

## 10. `src/services/payroll.service.js` - the head chef for payroll

### `runPayroll`, in five steps

```js
const { employeeId, period, overtimeHours, deductions } = body || {};
if (!Number.isInteger(Number(employeeId)) || Number(employeeId) <= 0 ||
    typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
    typeof overtimeHours !== 'number' || ... overtimeHours > 100 ||
    typeof deductions !== 'number' || ... deductions < 0) {
  throw new HttpError(400, 'Provide a positive employeeId, YYYY-MM period, ...');
}
```

**Step 1 - check the input.** The employee id must be a positive whole number. The period must look like `2026-10` (month 01-12). Overtime must be a number from 0 to 100. The extra deductions must be 0 or more.

```js
const employee = await fetchEmployee(employeeId, token);
const base = Number(employee.baseSalary);
if (!Number.isFinite(base) || base <= 0) throw new HttpError(502, 'Employee service returned invalid salary data');
```

**Step 2 - get the salary** from employee-service. If the salary comes back unusable, that is treated as the *other service's* fault (502), not the user's.

```js
const baseSalary = round2(base);
const grossPay = round2(base + (base / 160 * 1.25 * overtimeHours));
const breakdown = computeDeductions({ baseSalary, grossPay, otherDeductions: deductions });
if (breakdown.totalDeductions > grossPay) throw new HttpError(400, 'Deductions cannot exceed gross pay');
```

**Step 3 - calculate.**
- `base / 160` = hourly pay, assuming 160 working hours in a month.
- Overtime is paid at **1.25 times** the hourly rate.
- **Gross pay = basic salary + overtime pay.**
- Then the tax file works out the contributions and tax. If everything taken off is more than gross pay, it is refused (400).

```js
const record = await repository.insertUnique(Number(employeeId), period, () => ({
  id: `${period}-${Number(employeeId)}-${Date.now()}`,
  ... sss, philhealth, pagibig, taxableIncome, withholdingTax, otherDeductions,
  deductions: breakdown.totalDeductions,
  netPay: round2(grossPay - breakdown.totalDeductions),
  createdAt: new Date().toISOString()
}));
if (!record) throw new HttpError(409, 'Payroll already exists for this employee and period');
return record;
```

**Step 4 - save it.** The record is a snapshot containing the employee's name and code, so the history still reads correctly even if the employee is later removed. **Net pay = gross pay minus total deductions.** If the repository says a run for this employee and month already exists, answer **409**.

### Worked example (you can do this on the slide)

Ana, salary 30,000, 8 overtime hours, no other deductions.

| Step | Calculation | Result |
|---|---|---|
| Hourly rate | 30,000 / 160 | 187.50 |
| Overtime pay | 187.50 x 1.25 x 8 | 1,875.00 |
| **Gross pay** | 30,000 + 1,875 | **31,875.00** |
| SSS | 30,000 rounds to 30,000, x 5% | 1,500.00 |
| PhilHealth | 30,000 x 2.5% | 750.00 |
| Pag-IBIG | 10,000 cap x 2% | 200.00 |
| Total contributions | 1,500 + 750 + 200 | 2,450.00 |
| **Taxable income** | 31,875 - 2,450 | **29,425.00** |
| Withholding tax | 29,425 is above 20,833, so 0 + 15% x (29,425 - 20,833) | 1,288.80 |
| Total deductions | 2,450 + 1,288.80 + 0 | 3,738.80 |
| **Net pay** | 31,875 - 3,738.80 | **28,136.20** |

(Worked out by hand from the rates in the code; the rates are demo values and should be confirmed against the official tables.)

### `exportRun` - CSV download

```js
content: `${CSV_COLUMNS.join(',')}\n` +
  CSV_COLUMNS.map(column => `"${String(record[column] ?? '').replaceAll('"', '""')}"`).join(',') + '\n'
```

- Builds a two-row CSV: a header row of column names, then one row of values.
- Every value is wrapped in quotes, and a quote inside a value is doubled (`"` becomes `""`). That is the CSV rule that keeps names like `Zed "Z", Jr.` from breaking the columns.
- `?? ''` turns a missing value (old runs have no SSS field) into an empty cell instead of the word "undefined".

## 11. `src/repositories/payroll.repository.js` - the JSON file storeroom

Payroll runs are saved in `data/payroll-runs.json`. The interesting part is doing this **safely**.

```js
async function readRecords() {
  try {
    const records = JSON.parse(await fs.readFile(config.recordsPath, 'utf8'));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
```

- Reads and parses the file. **No file yet** (`ENOENT`) simply means "no runs", so it returns an empty list. A **damaged** file throws an error rather than silently wiping your data.

```js
async function saveRecords(records) {
  const temporaryPath = `${config.recordsPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(records, null, 2) + '\n', 'utf8');
  await fs.rename(temporaryPath, config.recordsPath);
}
```

**Safe save:** write to a temporary file first, then rename it over the real one. If the computer crashes mid-write, the real file is never left half-written.

```js
let writeQueue = Promise.resolve();
function serializeWrite(operation) {
  const pending = writeQueue.then(operation);
  writeQueue = pending.catch(() => {});
  return pending;
}
```

**The queue (a one-person-at-a-time line).** Without it, two requests could read the file together and one would overwrite the other's run. Each write waits for the one before it. The `.catch(() => {})` makes sure one failed write does not block everyone behind it.

```js
function insertUnique(employeeId, period, buildRecord) {
  return serializeWrite(async () => {
    const records = await readRecords();
    if (records.some(r => r.employeeId === employeeId && r.period === period)) return null;
    const record = buildRecord();
    records.push(record);
    await saveRecords(records);
    return record;
  });
}
```

**Check and save in one step.** "Is there already a run for this employee and month?" and "save it" happen inside the same queued step, so two people clicking at the same moment cannot both succeed. One gets the record; the other gets `null`, which becomes a 409.

`findAll` and `findById` first wait for any pending write, so they never see a half-finished state.

## 12. The photo files

### `src/services/image.service.js` - the head chef for photos

```js
function detectType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (... first 8 bytes are the PNG signature ...) return 'image/png';
  if (... starts with "RIFF" and has "WEBP" at position 8 ...) return 'image/webp';
  return null;
}
```

**Never trust the file name or the declared type.** Every real image file starts with a few fixed bytes (a "magic number"). This function reads those first bytes to find out what the file really is. Renaming `virus.exe` to `photo.png` does not fool it.

`upload` runs these checks in order:

```
1. Is the employee id a positive whole number?        -> else 400
2. Is AWS switched on and a bucket named?              -> else 503
3. Is there actually a file in the request?            -> else 400
4. Is it really a JPEG / PNG / WebP?                   -> else 400
5. Does this employee exist (ask employee-service)?    -> else 404
6. Save it to S3, then hand back a temporary link
```

```js
function storageFailure(error) {
  console.error('Image storage failed:', error.name, '-', error.message);
  return new HttpError(503, 'Image storage unavailable');
}
```

The real S3 error is **logged for the developer**, while the user sees only "Image storage unavailable". When uploads fail, this log line in the terminal is the first place to look.

`listUrls` returns an empty `{}` when AWS is off (so the page just shows initials instead of photos). Otherwise it finds which employees have photos and builds a link for each, **all at the same time** (`Promise.all`) instead of one by one.

### `src/repositories/image.repository.js` - talking to S3

```js
const keyFor = employeeId => `employees/${employeeId}/photo`;
```

Each employee has one photo at the path `employees/<id>/photo`. Uploading again simply replaces it.

```js
function s3() {
  if (!cached) {
    const sdk = require('@aws-sdk/client-s3');
    cached = { sdk, client: new sdk.S3Client({ region: config.aws.region }) };
  }
  return cached;
}
```

The S3 connection is created **the first time it is needed** and then reused. Because of this, in offline mode the AWS toolkit is never even loaded. Credentials are not passed here; the toolkit finds them on your machine.

**`put` - save a photo**

```js
async function put(employeeId, body, contentType) {
  const { sdk, client } = s3();
  await client.send(new sdk.PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: keyFor(employeeId),
    Body: body,
    ContentType: contentType
  }));
}
```

- `s3()` returns the shared connection (`client`) and the toolkit (`sdk`).
- `PutObjectCommand` is S3's "store this file" request. `Bucket` is which bucket, `Key` is the file's path inside it, `Body` is the image bytes, and `ContentType` tells browsers it is a PNG, JPEG or WebP.
- `client.send(...)` sends it. `await` waits for S3 to confirm. If S3 refuses, it throws, and the service layer turns that into a 503.

**`remove` - delete a photo**

```js
async function remove(employeeId) {
  const { sdk, client } = s3();
  await client.send(new sdk.DeleteObjectCommand({ Bucket: config.aws.s3Bucket, Key: keyFor(employeeId) }));
}
```

Same idea with `DeleteObjectCommand`. Deleting a photo that does not exist is not an error in S3, so removing twice is safe.

**`signedUrl` - a temporary link to view a photo**

```js
async function signedUrl(employeeId) {
  const { sdk, client } = s3();
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(client, new sdk.GetObjectCommand({ Bucket: config.aws.s3Bucket, Key: keyFor(employeeId) }),
    { expiresIn: config.imageUrlTtlSeconds });
}
```

- The bucket is **private**: nobody can open a photo with a plain web address.
- `GetObjectCommand` describes "read this file". `getSignedUrl` takes that request and **signs it with your AWS credentials**, producing a long web address that carries a proof of permission.
- `expiresIn: 300` makes the link stop working after 5 minutes. The browser can show the photo with an ordinary `<img src="...">`, with no AWS access of its own.
- The signing library is loaded here, only when needed.

**`listEmployeeIds` - which employees have photos?**

```js
async function listEmployeeIds() {
  const { sdk, client } = s3();
  const ids = [];
  let token;
  do {
    const page = await client.send(new sdk.ListObjectsV2Command({
      Bucket: config.aws.s3Bucket,
      Prefix: PREFIX,
      ContinuationToken: token
    }));
    for (const object of page.Contents || []) {
      const match = /^employees\/(\d+)\/photo$/.exec(object.Key);
      if (match) ids.push(Number(match[1]));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return ids;
}
```

- `ListObjectsV2Command` lists files. `Prefix: 'employees/'` limits the list to the photo folder.
- S3 returns **at most 1,000 names per request**. `IsTruncated` says "there are more", and `NextContinuationToken` is a bookmark for the next page.
- The `do { ... } while (token)` loop asks, collects, and asks again with the bookmark until there are no more pages.
- `page.Contents || []` handles an empty bucket, where S3 sends no list at all.
- The pattern `^employees\/(\d+)\/photo$` keeps only keys of exactly the form `employees/<digits>/photo`, and the `(\d+)` part captures the employee id. Anything else in the bucket is ignored.
- It returns plain numbers like `[1, 3, 7]`. `image.service.listUrls` then signs a link for each, all at once.

### `src/controllers/image.controller.js`

```js
function fail(error, res, next) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.cause || error.name === 'TypeError') return res.status(502).json({ error: 'Employee service unavailable' });
  return next(error);
}

async function upload(req, res, next) {
  try {
    res.json(await service.upload(req.params.employeeId, req.body, req.token));
  } catch (error) { fail(error, res, next); }
}

async function remove(req, res, next) {
  try {
    await service.remove(req.params.employeeId);
    res.status(204).end();
  } catch (error) { fail(error, res, next); }
}
```

- **`fail`** is the one place errors are translated, so the three functions do not repeat it. A known `HttpError` keeps its status. A network failure (`TypeError` or an error with a `cause`) means employee-service could not be reached, so it becomes **502**. Anything else goes to the safety net.
- **`upload`** passes the employee id from the URL (`req.params.employeeId`) and the photo bytes (`req.body`, filled in by `express.raw`) to the service. `res.json(...)` sends back `{ employeeId, url }` with status 200.
- **`remove`** waits for the delete to finish, then answers `204 No Content` with `res.status(204).end()`: success, nothing to send back.
- **`list`** (not shown) calls `service.listUrls()` and returns the `{ employeeId: url }` map.

## 13. `src/services/aws.service.js` and `aws.controller.js` - "is AWS connected?"

```js
async function getCallerIdentity() {
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
  const client = new STSClient({ region: config.aws.region });
  const identity = await client.send(new GetCallerIdentityCommand({}));
  const account = typeof identity.Account === 'string' ? `****${identity.Account.slice(-4)}` : null;
  const arn = typeof identity.Arn === 'string'
    ? identity.Arn.replace(/:user\/([^/]+)/, ':user/***').replace(/:role\/([^/]+)/, ':role/***')
    : null;
  return { account, arn };
}
```

- `require(...)` is inside the function, so the AWS toolkit is only loaded when someone actually asks. In offline mode it is never loaded.
- `STSClient` is the connection to AWS's Security Token Service. `GetCallerIdentityCommand` asks one question: "who am I, using these credentials?" It needs **no special permission**, which makes it a safe connection test.
- The answer is **masked**: `slice(-4)` keeps only the last 4 digits of the account number (`****1234`), and the two `replace` calls swap a user or role name in the ARN for `***`. A status page should not expose real identifiers.
- `typeof ... === 'string'` guards against a missing value, returning `null` instead of crashing.

```js
if (!service.isEnabled()) return res.json({ mode: 'offline', enabled: false });
```

| Response | Meaning |
|---|---|
| `{"mode":"offline","enabled":false}` | `AWS_ENABLED` is not `true` (the settings were not loaded, or you chose offline) |
| `{"mode":"aws","enabled":true,"account":"****1234",...}` | Connected |
| `503 AWS identity unavailable` | AWS is on, but your credentials failed |

---

# Try it live

Sign in through employee-service first, then use the token here.

```powershell
# Sign in as the administrator
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/auth/login -ContentType 'application/json' `
  -Body '{"emailAddress":"vance.albert.reyes@pwc.com","password":"admin"}'
$h = @{ Authorization = "Bearer $($login.token)" }

# Is it alive? (no token needed)
Invoke-RestMethod http://localhost:3001/health

# Without a token: 401
try { Invoke-RestMethod http://localhost:3001/api/payroll } catch { $_.ErrorDetails.Message }

# Run payroll (employee 1, October 2026, 8 hours overtime, no extra deductions)
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/payroll/run -Headers $h -ContentType 'application/json' `
  -Body '{"employeeId":1,"period":"2026-10","overtimeHours":8,"deductions":0}'

# Run the same again to see the 409 conflict

# See the history
Invoke-RestMethod http://localhost:3001/api/payroll -Headers $h

# Is AWS connected? (admin only)
Invoke-RestMethod http://localhost:3001/api/aws/identity -Headers $h
```

To show the member restriction, sign up a member through `/api/auth/signup` (see the employee-service guide), then repeat the `run` call with that member's token: it answers **403 Admin access required**, while the history call still works.

Employee-service (port 8081) must be running for signing in and for looking up salaries. Once you hold a token, checking it here does not need employee-service. The token you get from `/api/auth/login` is accepted here only because this service's `.env` holds the same `JWT_SECRET`.

# Questions you may be asked

**Why is the tax in its own file?** Rates change. Keeping them in `ph-deductions.js` means a rate change touches one file and nothing else.

**Why does the service call employee-service instead of copying salaries?** One source of truth. The salary lives in one place, so it cannot disagree.

**Why a JSON file instead of a database?** Simple for a demo and survives restarts. The repository layer means swapping in a real database would not change any other file.

**What stops two payroll runs for the same month?** The duplicate check and the save happen together inside the write queue, so a second request gets a 409.

**Why are the photos private?** They are personal data. The bucket allows no public access; users only get links that expire after 5 minutes.

**What does "offline mode" mean?** AWS is switched off. The service still does payroll; photos just show as initials, and upload returns 503.

**Are the tax numbers exact?** They are demo values based on the TRAIN-law monthly brackets and common contribution rates. Confirm them with the SSS, PhilHealth, Pag-IBIG and BIR before real use.

**How does this service know who is signed in?** It does not keep accounts and does not ask anyone. The token is a signed JWT, and `jsonwebtoken` verifies the signature with the secret shared with employee-service. The claims inside (`sub`, `email`, `role`) become `req.user`.

**What if someone edits the token to say `admin`?** The signature stops matching, so `jwt.verify` throws and the answer is 401. Without `JWT_SECRET` they cannot produce a valid signature.

**What did we gain by switching to JWT?** No network call per request, so it is faster and keeps working for already signed-in users while employee-service is down (only calls that need employee data fail, with 502). The services are also independent: no shared session table is needed.

**What did we lose?** The ability to cancel a token. Logging out only clears the browser; a password reset or a role change does not affect tokens already issued. Each token works until it expires (60 minutes). Fixes: a shorter lifetime, or a small list of cancelled tokens that every service checks.

**What if `JWT_SECRET` differs between services?** Sign-in works (employee-service signs with its copy), but this service verifies with its own different copy, so every request answers 401. If everything is signed in yet nothing loads, compare the three `.env` files first.

**Why forward the user's token to employee-service?** employee-service now rejects unsigned requests. Passing the caller's own token means this service never holds a powerful key of its own, and the lookup is allowed only if the caller is allowed.

**Why can a member view payroll history but not run payroll?** Viewing is harmless; running payroll creates records. Reading is open to any signed-in user, and anything that changes data needs `admin`.

**What are the weak points?** Malformed JSON gives a 500, not a 400. Employee ids reset when employee-service restarts, so old photos or runs could point at the wrong person. Traffic is plain HTTP, so tokens could be read on a real network. Tokens cannot be cancelled before they expire. And it still depends on employee-service for employee data (salaries and photo checks).
