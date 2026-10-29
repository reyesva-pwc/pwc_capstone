# employee-service (Java / Spring Boot) - port 8081

## In one sentence

The service that **owns the employee list**: it accepts new employees, rejects bad data, and lets other programs look employees up. It is also the app's **sign-in office**: it keeps the user accounts, checks passwords, and **issues the signed JWT tokens**. The other two services check those tokens themselves, using a secret they share with this one.

## The restaurant, applied

| Restaurant | In this service |
|---|---|
| Waiter | `EmployeeController`: receives the HTTP request, sends back the HTTP answer |
| Order-slip checker | `CreateEmployee`: the annotations on each field check the **format** |
| Head chef | `EmployeeService`: the rules that need other data (allowed positions, duplicate email, salary range) |
| Storeroom clerk | `EmployeeRepository`: the only class that writes SQL |
| The storeroom | The H2 database |
| The dish served | `Employee`: what the API returns |

**Where is validation done?** In three places, each with a different job:

| Where | What it checks | Why there |
|---|---|---|
| `CreateEmployee` (annotations) | **Format** of each field: required, length, characters, email pattern, phone pattern, decimal places | Rules that look only at the value itself |
| `EmployeeService.validate` | Rules that need **other information**: position is one of three, email not already used, salary fits the position | Needs the database or two fields together |
| `schema.sql` (constraints) | The same main rules again, plus **UNIQUE email** | Last line of defense that nothing can bypass |

```
POST /api/employees
        |
        v
Spring reads the JSON into CreateEmployee and runs the annotations (@Valid)
        |
        v
EmployeeController  ----- body missing? -> 400
        |   collects one format message per field
        v
EmployeeService.validate  ----- adds: bad position / duplicate email / salary out of range
        |
        v
any problems?  -> 400 with a message FOR EACH FIELD, all at once
        |
        v
EmployeeService.create  (lowercase the email)
        |
        v
EmployeeRepository.insert  ->  database creates the id and the EMPxxx code
        |                       (and refuses a duplicate email -> 409)
        v
201 Created + the saved employee
```

## What the API offers

| Method | URL | What it does | Answers |
|---|---|---|---|
**Employees** (every call needs a signed-in user; reading is open to `member` and `admin`, adding and deleting is `admin` only):

| Method | URL | Who | What it does | Answers |
|---|---|---|---|---|
| GET | `/api/employees` | any signed-in user | List everyone | 200, 401 |
| GET | `/api/employees/{id}` | any signed-in user | Get one person | 200, 401, 404 |
| POST | `/api/employees` | admin | Add a person | 201, 400 (invalid), 401, 403, 409 (duplicate email race) |
| DELETE | `/api/employees/{id}` | admin | Remove a person | 204, 401, 403, 404 |

**Sign-in** (`/api/auth/...`, all open, because the person has no token yet):

| Method | URL | What it does | Answers |
|---|---|---|---|
| POST | `/api/auth/signup` | Create a `member` account and sign in | 201, 400, 409 (already registered) |
| POST | `/api/auth/login` | Sign in with e-mail and password | 200 (token), 400, 401 (wrong details), 429 (locked) |
| POST | `/api/auth/forgot-password` | Create a reset code (printed in the server console) | 200 (same answer whether or not the account exists), 400 |
| POST | `/api/auth/reset-password` | Set a new password using the code | 200, 400 (bad code), 429 |

There is no `/me` and no `/logout` any more. Other services no longer ask this one who a token belongs to (they verify the signature themselves), and a JWT is not stored here, so there is nothing to end on the server.

A successful sign-in answers `{ "token": "eyJhbGciOi...", "expiresAt": 1792..., "user": { "id": 1, "emailAddress": "...", "role": "admin" } }`. `token` is the JWT; `expiresAt` is the same expiry in milliseconds, for the browser's timer. The password hash is never returned.

**Error answers for adding an employee** have two parts, so a screen can show a message under each input:

```json
{ "error": "fullName ...; emailAddress ...",
  "fieldErrors": { "fullName": "fullName ...", "emailAddress": "emailAddress ..." } }
```

`error` is all the messages joined together; `fieldErrors` has one message per field.

## Folder map

```
employee-service/src/main/
├── java/com/example/employees/
│   ├── EmployeeServiceApplication.java   starts the program
│   ├── controller/
│   │   ├── EmployeeController.java       the waiter for employees
│   │   ├── AuthController.java           the waiter for sign-in
│   │   └── ValidationSupport.java        picks one message per field
│   ├── service/
│   │   ├── EmployeeService.java          the chef (employee rules)
│   │   ├── AuthService.java              the chef (sign-up, sign-in, password reset)
│   │   └── AuthException.java            an error that carries an HTTP status
│   ├── repository/
│   │   ├── EmployeeRepository.java       the storeroom clerk (employees)
│   │   └── AuthRepository.java           the storeroom clerk (users, reset codes)
│   ├── security/
│   │   ├── JwtService.java               creates and checks the signed JWT tokens
│   │   ├── PasswordHasher.java           scrambles passwords one-way
│   │   ├── AttemptTracker.java           counts wrong passwords, locks accounts
│   │   ├── BearerToken.java              reads the token from a request
│   │   └── AuthInterceptor.java          the doorman for /api/employees
│   ├── config/
│   │   ├── WebConfig.java                tells Spring where the doorman stands
│   │   └── AdminSeeder.java              creates the first administrator
│   ├── model/                            Employee, User, UserAccount, LoginResult, PasswordReset
│   └── dto/                              CreateEmployee, LoginRequest, SignUpRequest,
│                                         ForgotPasswordRequest, ResetPasswordRequest, AuthPatterns
├── resources/
│   ├── application.properties            settings (reads .env for the JWT secret)
│   ├── schema.sql                        creates the tables
│   └── data.sql                          10 sample employees
├── .env                                  your private JWT_SECRET (git-ignored, not in the repo)
└── .env.example                          the template: the key name with an empty value
```

---

# Class by class

## 1. `EmployeeServiceApplication` - the start button

```java
@SpringBootApplication
public class EmployeeServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(EmployeeServiceApplication.class, args);
    }
}
```

**What it does:** starts the whole service.

- `main` is where every Java program begins.
- `SpringApplication.run(...)` boots up the web server on port 8081, connects the database, and creates all the other classes.
- `@SpringBootApplication` tells Spring "look in this package and below, and set up everything you find". That is why the other classes need no setup code of their own.

**Say it like this:** "This is the power button. Everything else is found automatically."

## 2. `Employee` - what the service sends out

```java
public record Employee(long id, String employeeCode, String fullName,
                       String position, String emailAddress,
                       String contactNumber, BigDecimal baseSalary) {}
```

**What it does:** describes one employee, as the API returns it.

- A `record` is a short way to write a read-only data holder. Java automatically adds the constructor and getters.
- Spring converts it to JSON by itself, so a returned `Employee` becomes `{"id":1,"employeeCode":"EMP001",...}`.
- `id` is the database's number (1, 2, 3...). `employeeCode` is the friendly code (`EMP001`).
- Salary is `BigDecimal`, not `double`, because computers store `double` with tiny rounding errors. That is unacceptable for money.

## 3. `CreateEmployee` - what the service accepts, and its format rules

```java
public record CreateEmployee(
        @NotBlank(message = "fullName is required")
        @Size(min = 2, max = 160, message = "fullName must be 2 to 160 characters")
        @Pattern(regexp = "^\\p{L}+(?: +\\p{L}+)*(?: +(?i:jr|sr)\\.)?$",
                message = "fullName may contain only letters and spaces (a period is allowed only in the suffix Jr. or Sr.)")
        String fullName,

        @NotBlank(message = "position is required")
        String position,

        @NotBlank(message = "emailAddress is required")
        @Size(max = 254, ...)
        @Pattern(regexp = "^[a-z0-9._%+-]+@pwc\\.com$", flags = Pattern.Flag.CASE_INSENSITIVE, ...)
        String emailAddress,

        @NotBlank(message = "contactNumber is required")
        @Pattern(regexp = "^\\+63\\d{10}$", ...)
        String contactNumber,

        @NotNull(message = "baseSalary is required")
        @DecimalMin(value = "0", inclusive = false, message = "baseSalary must be greater than 0")
        @DecimalMax(value = "9999999999999.99", ...)
        @Digits(integer = 13, fraction = 2, message = "baseSalary can have at most 2 decimal places")
        BigDecimal baseSalary) {

    public CreateEmployee {
        fullName = trimmed(fullName);
        ...
    }
}
```

**What it does:** describes the JSON a client must send to add an employee, and checks the **format** of every field.

- Compare it with `Employee`: **there is no `id` and no `employeeCode`.** The database creates those, so a client cannot pick its own. This separation is called a **DTO** (data transfer object).
- Each **annotation** is a rule written directly on the field, and `message` is the text shown when it fails:

| Annotation | Meaning |
|---|---|
| `@NotBlank` | Must have text (not missing, not just spaces) |
| `@NotNull` | Must be present (used for numbers) |
| `@Size(min, max)` | Text length limits |
| `@Pattern(regexp)` | Text must match a pattern |
| `@DecimalMin` / `@DecimalMax` | Number limits. `inclusive = false` means "strictly greater than 0" |
| `@Digits(integer, fraction)` | At most this many digits before and after the decimal point. `fraction = 2` is what stops `100.555` |

- The **name pattern** in plain words: letters and single spaces only. A period is allowed only in a final `Jr.` or `Sr.` (any capitalization). So `Dani Flores Jr.` is accepted; `Dani. Flores`, `R2D2` and `Mary-Ann` are not.
- The block after the fields is a **compact constructor**. It runs whenever the record is created and trims leading and trailing spaces from the text fields, so `"  Dani "` is checked and saved as `"Dani"`.
- The annotations only run when the controller asks for it with `@Valid` (next section). The library that provides them is `spring-boot-starter-validation` in `pom.xml`.

**Say it like this:** "The order slip checks itself. Each field carries its own rule."

## 4. `EmployeeController` - the waiter

```java
@RestController
@RequestMapping("/api/employees")
@CrossOrigin(origins = "http://localhost:5173")
public class EmployeeController {
    private final EmployeeService service;

    public EmployeeController(EmployeeService service) {
        this.service = service;
    }
```

- `@RestController`: "return values become the HTTP answer (as JSON)".
- `@RequestMapping("/api/employees")`: every URL in this class starts with this path.
- `@CrossOrigin(...)`: the browser blocks calls between different addresses unless the server agrees. This allows only the React app on port 5173.
- The constructor receives the `EmployeeService`. We never write `new EmployeeService()`; Spring supplies it (dependency injection).

### List everyone

```java
@GetMapping
public List<Employee> list() {
    return service.findAll();
}
```

`GET /api/employees` asks the chef for everyone and returns the list. One line, because the waiter does no cooking.

### Get one person

```java
@GetMapping("/{id}")
public ResponseEntity<?> get(@PathVariable long id) {
    return service.findById(id)
        .<ResponseEntity<?>>map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
}
```

- `@PathVariable` takes the `{id}` from the URL (`/api/employees/3` gives `id = 3`).
- `findById` returns an `Optional`: a box that **may or may not contain** an employee.
- `.map(ResponseEntity::ok)`: if the box has an employee, answer **200** with it.
- `.orElseGet(... notFound ...)`: if the box is empty, answer **404**.
- payroll-service calls exactly this URL to learn an employee's salary.

### Add a person

```java
@PostMapping
public ResponseEntity<?> create(@Valid @RequestBody(required = false) CreateEmployee input, BindingResult bindingResult) {
    if (input == null) {
        return ResponseEntity.badRequest().body(Map.of("error", "Request body is required"));
    }
    Map<String, String> fieldErrors = service.validate(input, formatErrors(bindingResult));
    if (!fieldErrors.isEmpty()) {
        return ResponseEntity.badRequest().body(Map.of("error", String.join("; ", fieldErrors.values()), "fieldErrors", fieldErrors));
    }
    try {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(input));
    } catch (DuplicateKeyException ex) {
        String message = EmployeeService.DUPLICATE_EMAIL_MESSAGE;
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", message, "fieldErrors", Map.of("emailAddress", message)));
    }
}
```

Step by step:
1. `@RequestBody` turns the incoming JSON into a `CreateEmployee`. `required = false` lets an empty request reach our code so we can give a friendly message instead of a framework error.
2. `@Valid` tells Spring to run the annotations from the previous section. Normally a failure would throw an error. Adding `BindingResult` right after tells Spring: "don't throw, hand me the list of failures instead". That lets us collect them.
3. Empty request: answer 400.
4. `formatErrors(...)` turns the failures into **one message per field**. If a field breaks several rules, only the most basic one is kept (required, then length, then characters), so an empty name says "fullName is required" and not three things. The helper is explained line by line below.
5. The chef's `validate` adds the rules that need other data. If anything is wrong, answer **400 with a message for each field, all at once**.
6. Otherwise `create` saves it and we answer **201 Created**.
7. **The `try/catch` is the safety net.** Two people could submit the same email in the same instant, and both would pass the check in step 5. The database's unique rule rejects the second one with a `DuplicateKeyException`, and the waiter turns that into a **409 Conflict** with the same message and field.

### Delete a person

```java
@DeleteMapping("/{id}")
public ResponseEntity<?> delete(@PathVariable long id) {
    return service.delete(id) ? ResponseEntity.noContent().build()
                              : ResponseEntity.notFound().build();
}
```

`delete` says `true` if a row was removed (answer **204**, "done, nothing to return") and `false` if there was no such employee (answer **404**).

### The helper that picks one message per field

When Spring runs the annotations, it reports **every** rule that failed. An empty name breaks `@NotBlank`, `@Size` and `@Pattern` all at once, and saying all three would be noise. These two small methods keep only the most basic one.

```java
private static final List<String> CONSTRAINT_PRIORITY =
        List.of("NotBlank", "NotNull", "Size", "DecimalMin", "DecimalMax", "Digits", "Pattern");

private Map<String, String> formatErrors(BindingResult bindingResult) {
    Map<String, FieldError> mostBasic = new HashMap<>();
    for (FieldError error : bindingResult.getFieldErrors()) {
        mostBasic.merge(error.getField(), error, (current, other) -> rank(other) < rank(current) ? other : current);
    }
    Map<String, String> messages = new HashMap<>();
    mostBasic.forEach((field, error) -> messages.put(field, error.getDefaultMessage()));
    return messages;
}

private int rank(FieldError error) {
    int index = CONSTRAINT_PRIORITY.indexOf(error.getCode());
    return index < 0 ? CONSTRAINT_PRIORITY.size() : index;
}
```

Line by line:
- `CONSTRAINT_PRIORITY` is the order of importance, most basic first: "is it there?" (`NotBlank`, `NotNull`), then "is it the right size?" (`Size`), then the number rules, and last "does it look right?" (`Pattern`).
- `bindingResult.getFieldErrors()` is the list of every failed annotation. Each item knows its field name (`getField()`), its annotation name (`getCode()`, such as `"NotBlank"`) and its message.
- `merge(field, error, ...)` builds a map with **one entry per field**. The first time a field is seen, its error is stored. If the field appears again, the small function decides which of the two to keep: the one with the **lower rank**.
- `rank` finds the error's annotation in the priority list. `NotBlank` is 0, `Size` is 2, `Pattern` is 6. An annotation that is not in the list gets the largest number, so it always loses.
- The last loop swaps each stored error for just its message text (`getDefaultMessage()`, the `message = "..."` written on the annotation) and returns a plain map of field name to message. This is what `EmployeeService.validate` receives as `formatErrors`.

**Example.** The name `""` (empty) fails `@NotBlank`, `@Size` and `@Pattern`. `NotBlank` ranks lowest, so only **"fullName is required"** is kept.

## 5. `EmployeeService` - the head chef

This is where the **business rules** live: the checks that cannot be written as a simple annotation because they need other information. It is the most important class to explain.

```java
public static final String DUPLICATE_EMAIL_MESSAGE = "emailAddress is already used by another employee";
private static final List<String> POSITIONS = List.of("Associate", "Senior Associate", "Manager");
private static final List<String> FIELD_ORDER = List.of("fullName", "position", "emailAddress", "contactNumber", "baseSalary");
```

- `DUPLICATE_EMAIL_MESSAGE` is public so the controller can reuse the exact same text.
- `POSITIONS` is the only list of allowed positions, kept in one place.
- `FIELD_ORDER` is the order errors are reported in, matching the order of the form.

### The simple pass-through methods

```java
public List<Employee> findAll()             { return repository.findAll(); }
public Optional<Employee> findById(long id) { return repository.findById(id); }
public boolean delete(long id)              { return repository.deleteById(id); }
```

They only pass the request down. They exist so the waiter never talks to the storeroom directly. If a rule is added later (for example "managers cannot be deleted"), it goes here and nothing else changes.

### `create` - clean up, then save

```java
public Employee create(CreateEmployee input) {
    long id = repository.insert(
            input.fullName(),
            input.position(),
            input.emailAddress().toLowerCase(),
            input.contactNumber(),
            input.baseSalary());
    return repository.findById(id).orElseThrow();
}
```

- The text fields are **already trimmed** by `CreateEmployee`, so the service no longer calls `.trim()`.
- `.toLowerCase()` on the email means `DANI@PWC.COM` and `dani@pwc.com` are stored the same way. This is also what makes the duplicate check case-insensitive.
- `insert` returns the new `id`. We then read the row back so the answer includes the **employee code the database just generated**.

### `validate` - the rules that need other information

The simple format checks (required, length, characters, patterns, decimal places) are now **annotations on `CreateEmployee`**. This method receives those results and adds the checks that need more than one field or the database.

```java
public Map<String, String> validate(CreateEmployee input, Map<String, String> formatErrors) {
    Map<String, String> errors = new HashMap<>(formatErrors);

    if (!errors.containsKey("position") && !POSITIONS.contains(input.position())) {
        errors.put("position", "position must be one of: " + String.join(", ", POSITIONS));
    }

    if (!errors.containsKey("emailAddress") && repository.existsByEmail(input.emailAddress().toLowerCase())) {
        errors.put("emailAddress", DUPLICATE_EMAIL_MESSAGE);
    }

    if (!errors.containsKey("position") && !errors.containsKey("baseSalary")) {
        String rangeError = salaryRangeError(input.position(), input.baseSalary());
        if (rangeError != null) errors.put("baseSalary", rangeError);
    }

    Map<String, String> ordered = new LinkedHashMap<>();
    for (String field : FIELD_ORDER) {
        if (errors.containsKey(field)) ordered.put(field, errors.get(field));
    }
    return ordered;
}
```

Line by line:
- It starts from the **format errors** passed in by the controller: a map of field name to message.
- **Position check:** the annotations only know the position is not blank. Here it is checked against the allowed list.
- **Duplicate email check:** this needs the database. It asks the repository whether the (lowercased) email already exists. It is skipped if the email already has a format error, so a badly typed address gets one message, not two.
- **Salary range check:** needs two fields together, the position and the salary. It is skipped if either is already wrong, because there is nothing sensible to compare.
- The last loop copies the errors into a `LinkedHashMap` in `FIELD_ORDER`, so they come out in the same order as the form.
- A `Map` (field to message) is used, not a list, so the front end can show each message **under its own input**.

The full rulebook, and where each rule lives:

| Field | Rules | Checked by |
|---|---|---|
| fullName | Required. 2-160 characters. Letters and spaces only; a period only in a final `Jr.` or `Sr.` | Annotations |
| position | Required. One of Associate, Senior Associate, Manager | Annotation (required) + service (allowed values) |
| emailAddress | Required. At most 254 characters. `name@pwc.com`, any capitalization. **Must not already be used** | Annotations + service (duplicate) + database (unique) |
| contactNumber | Required. `+63` followed by exactly 10 digits | Annotations |
| baseSalary | Required. Above 0. At most 2 decimal places. Must fit the position's range (below) | Annotations + service (range) |

### `salaryRangeError` - pay depends on position

```java
return switch (position) {
    case "Associate" -> salary.compareTo(associateMin) < 0 || salary.compareTo(associateMax) > 0
            ? "baseSalary for Associate must be between 20,000 and 60,000" : null;
    case "Senior Associate" -> salary.compareTo(associateMax) <= 0 || salary.compareTo(seniorMax) > 0
            ? "baseSalary for Senior Associate must be between 60,001 and 100,000" : null;
    case "Manager" -> salary.compareTo(seniorMax) <= 0
            ? "baseSalary for Manager must be 100,001 or above" : null;
    default -> null;
};
```

| Position | Allowed monthly salary |
|---|---|
| Associate | 20,000 to 60,000 |
| Senior Associate | 60,001 to 100,000 |
| Manager | 100,001 and above |

- A `switch` picks the rule for the position. It returns an error message, or `null` meaning "fine".
- Money is compared with `compareTo`, not `==`. For `BigDecimal`, `==` compares *objects*, not values.
- This check is skipped when the position itself is invalid, so a bad position gives one error, not two.

**Say it like this:** "The order slip checks the format of each field. The chef checks the rules that need other information, and hands back a complaint for every field at once."

## 6. `EmployeeRepository` - the storeroom clerk

The **only** class that contains SQL.

```java
@Repository
public class EmployeeRepository {
    private static final String SELECT = "SELECT id, employee_code, full_name, position, email_address, contact_number, base_salary FROM employees";
    private final JdbcTemplate jdbc;
```

- `@Repository` marks it as a data-access class.
- `JdbcTemplate` is Spring's helper for running SQL. It opens and closes connections for you.
- The column list is written once in `SELECT` and reused.

### Reading

```java
public List<Employee> findAll() {
    return jdbc.query(SELECT + " ORDER BY id", this::mapEmployee);
}
public Optional<Employee> findById(long id) {
    return jdbc.query(SELECT + " WHERE id = ?", this::mapEmployee, id).stream().findFirst();
}
```

- `query` runs the SQL, then calls `mapEmployee` once per row to build an `Employee`.
- The `?` is a **placeholder**. The id is passed separately and never glued into the SQL text. This is what prevents *SQL injection*, the classic attack.
- `findFirst()` gives an empty `Optional` when no row matches, which the controller turns into 404.

### Checking for a duplicate email

```java
public boolean existsByEmail(String emailAddress) {
    Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM employees WHERE email_address = ?", Integer.class, emailAddress);
    return count != null && count > 0;
}
```

- Counts how many employees already have this email. More than zero means it is taken.
- The email is passed as a `?` placeholder like every other query, so it is safe from SQL injection.
- The service passes it already lowercased, and the table only stores lowercase emails (see `schema.sql`), so `ANA.CRUZ@PWC.COM` matches `ana.cruz@pwc.com`.

### Adding

```java
public long insert(String fullName, String position, String emailAddress, String contactNumber, BigDecimal baseSalary) {
    KeyHolder keys = new GeneratedKeyHolder();
    jdbc.update(con -> {
        PreparedStatement ps = con.prepareStatement(
                "INSERT INTO employees (full_name, position, email_address, contact_number, base_salary) VALUES (?, ?, ?, ?, ?)",
                new String[] {"id"});
        ps.setString(1, fullName);
        ...
        return ps;
    }, keys);
    return keys.getKey().longValue();
}
```

Line by line:
- `KeyHolder keys = new GeneratedKeyHolder();` is an empty box that the database will drop the new id into.
- `jdbc.update(con -> {...}, keys)` runs a write. The part in braces builds the SQL statement from a database connection (`con`). The second argument, `keys`, is the box to fill.
- The INSERT does **not** list `id` or `employee_code`. The database creates both.
- `new String[] {"id"}` says "after inserting, give me back the value of the `id` column".
- A **`PreparedStatement`** is SQL with `?` holes. `ps.setString(1, fullName)` fills the first hole, `ps.setString(2, position)` the second, and so on up to `ps.setBigDecimal(5, baseSalary)`. The values are sent separately from the SQL text, so a name such as `x'); DROP TABLE employees; --` is stored as a harmless name and can never run as a command.
- `return ps;` hands the finished statement back so Spring can run it.
- `keys.getKey().longValue()` reads the id out of the box and returns it. That id is handed back to the service.

**What the database can reject here.** If the email already exists, the `UNIQUE` rule makes the insert fail with a `DuplicateKeyException`. This repository does not catch it. It travels up through the service to the controller, which turns it into the 409 answer.

### Removing, and turning rows into objects

```java
public boolean deleteById(long id) {
    return jdbc.update("DELETE FROM employees WHERE id = ?", id) > 0;
}

private Employee mapEmployee(ResultSet rs, int rowNum) throws SQLException {
    return new Employee(rs.getLong("id"), rs.getString("employee_code"), rs.getString("full_name"),
            rs.getString("position"), rs.getString("email_address"), rs.getString("contact_number"),
            rs.getBigDecimal("base_salary"));
}
```

- `update` returns how many rows changed, so `> 0` means "something was deleted".
- `ResultSet rs` is one row of the query result, and `rs.getString("full_name")` reads the column with that name. The values are read **by column name**, not position, so the order of the columns in the SELECT does not matter.
- `rs.getBigDecimal` keeps the salary exact, in line with the `BigDecimal` used everywhere else.
- `rowNum` is the row's position in the result. It is required by the method shape but not needed here.
- `throws SQLException` is required because reading a column can fail.
- This method is passed to `query` as `this::mapEmployee`, which means "call this method once for every row".

---

# Sign-in and accounts (the second half of this service)

Everything above is about employees. This part is about **who may use the app**. It uses the same layers (waiter, chef, storeroom clerk) plus a **doorman** (`AuthInterceptor`) that stands in front of the employee endpoints.

```
Sign in:   AuthController -> AuthService -> AuthRepository -> users table
                                         \-> JwtService (signs the token)
Every call to /api/employees:  AuthInterceptor -> AuthService -> JwtService (checks the signature)
```

Nothing about a token is stored in the database. The token itself proves who you are.

## 7. The tables in `schema.sql`

```sql
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    email_address VARCHAR(254) NOT NULL,
    password_hash VARCHAR(300) NOT NULL,
    role VARCHAR(10) NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email_address),
    CONSTRAINT chk_users_email_lowercase CHECK (email_address = LOWER(email_address)),
    CONSTRAINT chk_users_email_domain CHECK (email_address LIKE '%@pwc.com'),
    CONSTRAINT chk_users_role CHECK (role IN ('admin', 'member'))
);
```

- **`id`** is generated automatically (the "id (auto generated)" column you asked for).
- **`email_address`** is the sign-in name. It is unique, always lowercase, and must end in `@pwc.com`, enforced by the database itself.
- **`password_hash`** holds the scrambled password, never the password. 300 characters is plenty for the hash format described below.
- **`role`** can only be `admin` or `member`. The database refuses anything else.

**There is no `sessions` table.** An earlier version stored a fingerprint of each token here so the server could look it up. With JWT the token carries everything and is checked by its signature, so the table (and the code that read and wrote it) was removed.

```sql
CREATE TABLE IF NOT EXISTS password_resets (
    user_id BIGINT PRIMARY KEY,
    code_hash VARCHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL,
    ...
);
```

- At most one reset code per user (`user_id` is the primary key). The code is stored as a fingerprint too.

## 8. `PasswordHasher` - scrambling passwords one way

```java
private static final String ALGORITHM = "PBKDF2WithHmacSHA512";
private static final int ITERATIONS = 210_000;
private static final int KEY_BITS = 512;
private static final int SALT_BYTES = 16;

public String hash(String password) {
    byte[] salt = new byte[SALT_BYTES];
    random.nextBytes(salt);
    byte[] key = derive(password, salt, ITERATIONS);
    return LABEL + "$" + ITERATIONS + "$" + encode(salt) + "$" + encode(key);
}
```

Line by line:
- **Hashing** turns a password into a long scramble that cannot be turned back. To check a login, we scramble what the user typed and compare the scrambles.
- `SALT_BYTES = 16` and `random.nextBytes(salt)` create a **salt**: 16 random bytes added to the password before scrambling. Two users with the password `admin` get completely different scrambles, and precomputed "rainbow tables" are useless.
- `PBKDF2WithHmacSHA512` is a standard algorithm designed to be **deliberately slow**. `ITERATIONS = 210_000` means it repeats the scramble that many times, so an attacker trying billions of guesses is slowed down a lot, while one sign-in still takes only a fraction of a second.
- The stored text looks like `pbkdf2-sha512$210000$<salt>$<hash>`. It remembers the settings used, so they can be raised later and old passwords still work.

```java
public boolean matches(String password, String stored) {
    String[] parts = stored.split("\\$");
    if (parts.length != 4 || !LABEL.equals(parts[0])) return false;
    try {
        int iterations = Integer.parseInt(parts[1]);
        byte[] salt = Base64.getDecoder().decode(parts[2]);
        byte[] expected = Base64.getDecoder().decode(parts[3]);
        return MessageDigest.isEqual(expected, derive(password, salt, iterations));
    } catch (IllegalArgumentException ex) {
        return false;
    }
}
```

- Splits the stored text back into its four parts, then scrambles the typed password with the **same salt and iterations** and compares.
- `MessageDigest.isEqual` compares in **constant time**: it takes the same time whether the first byte or the last byte differs. A normal `equals` stops at the first difference, and measuring that can leak information.
- A damaged stored value returns `false` rather than crashing.

## 9. `AuthRepository` - the storeroom clerk for accounts

All SQL for users and reset codes, using the same safe `?` placeholders as the employee repository. It no longer touches any token table. The important ones:

```java
public void saveResetCode(long userId, String codeHash, long expiresAt) {
    jdbc.update("DELETE FROM password_resets WHERE user_id = ?", userId);
    jdbc.update("INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, ?)", ...);
}
```

- Replaces any older code, so asking again invalidates the previous code.
- The others are plain: `findAccountByEmail`, `existsByEmail`, `insertUser` (returns the new id), `updatePassword`, `findResetCode`, `deleteResetCode`.

## 10. `AttemptTracker` - locking out guessers

```java
private static final int MAX_FAILURES = 5;
private static final long WINDOW_MS = Duration.ofMinutes(15).toMillis();
private static final int MAX_KEYS = 10_000;
private final Map<String, Entry> entries = new ConcurrentHashMap<>();
```

Remembers wrong attempts **in memory** (so a restart clears the lock-outs), keyed by e-mail address. Settings: 5 failures lock the key for 15 minutes.

```java
public void recordFailure(String key) {
    ...
    entries.compute(key, (k, current) -> {
        boolean stale = current == null || (current.lockedUntilMs() <= now && now - current.lastFailureMs() > WINDOW_MS);
        int failures = (stale ? 0 : current.failures()) + 1;
        return failures >= MAX_FAILURES ? new Entry(0, now, now + WINDOW_MS) : new Entry(failures, now, 0);
    });
}
```

- `compute` updates the entry **atomically**, so two simultaneous wrong guesses cannot both be counted as the same attempt.
- If the previous failures are older than 15 minutes, the count starts again at zero ("stale").
- On the 5th failure it stores a `lockedUntil` time 15 minutes ahead.
- `lockedSeconds` reports how long is left. `clear` forgets a key after a good sign-in.
- **`MAX_KEYS = 10_000`** keeps the table bounded: an attacker who sends millions of different made-up e-mails cannot use up the server's memory. Old entries are purged first; if the table is still full, new keys are ignored.

## 11. `AuthService` - the chef for accounts

### Sign up

```java
public LoginResult signUp(String emailAddress, String password) {
    String email = emailAddress.toLowerCase();
    if (repository.existsByEmail(email)) throw alreadyRegistered();
    long id;
    try {
        id = repository.insertUser(email, hasher.hash(password), ROLE_MEMBER);
    } catch (DuplicateKeyException ex) {
        throw alreadyRegistered();
    }
    return jwt.issue(new User(id, email, ROLE_MEMBER));
}
```

- Lowercases the e-mail, refuses one that already exists (409), hashes the password, and saves the new user.
- The role is **hard-coded as `member`**. The request has no `role` field, so nobody can sign up as an admin.
- The `catch` is the same race-condition safety net as for employees: if two sign-ups arrive together, the database's unique rule rejects the second.
- It signs the person in straight away by asking `JwtService` to issue a token.

### Sign in

```java
public LoginResult login(String emailAddress, String password) {
    String email = emailAddress.toLowerCase();
    long locked = attempts.lockedSeconds(email);
    if (locked > 0) throw lockedOut(locked);

    Optional<UserAccount> account = repository.findAccountByEmail(email);
    boolean passwordOk = hasher.matches(password, account.map(UserAccount::passwordHash).orElse(dummyHash));
    if (account.isEmpty() || !passwordOk) {
        attempts.recordFailure(email);
        throw new AuthException(401, "Invalid email or password");
    }
    attempts.clear(email);
    return jwt.issue(account.get().toUser());
}
```

Step by step:
1. **Locked?** If this e-mail has had too many failures, stop with 429 before checking anything.
2. Look up the account.
3. **Check the password even when the account does not exist**, against a fake `dummyHash`. This is deliberate: without it, an unknown e-mail would answer instantly and a known one slowly, and an attacker could use the timing to discover which e-mails are registered.
4. Wrong e-mail and wrong password give the **same message**, "Invalid email or password", for the same reason.
5. A failure is counted; a success clears the counter and issues a JWT.

### Checking a token

```java
public Optional<User> authenticate(String token) {
    return jwt.verify(token);
}
```

- "Whose token is this?" is now answered by `JwtService`, which checks the signature and expiry. No database lookup is involved. The token creation itself is explained in the next section.

### Forgot password and reset

```java
public void requestPasswordReset(String emailAddress) {
    repository.findAccountByEmail(emailAddress.toLowerCase()).ifPresent(account -> {
        String code = String.format("%06d", random.nextInt(1_000_000));
        repository.saveResetCode(account.id(), resetHash(account.id(), code), System.currentTimeMillis() + RESET_MS);
        log.warn("PASSWORD RESET CODE for {}: {} ...", account.emailAddress(), code, ...);
    });
}
```

- Makes a random 6-digit code (`%06d` pads with zeros), saves only its fingerprint, valid 15 minutes.
- There is **no e-mail service**, so the code is written to the server log instead. In a real system this line would send an e-mail.
- It does nothing visible if the account does not exist, and the controller gives the same answer either way, so this cannot be used to find out who is registered.

```java
public void resetPassword(String emailAddress, String code, String newPassword) {
    ... locked? ...
    boolean valid = reset.isPresent()
            && reset.get().expiresAt() > System.currentTimeMillis()
            && MessageDigest.isEqual(reset.get().codeHash().getBytes(...), resetHash(account.get().id(), code).getBytes(...));
    if (!valid) { attempts.recordFailure(key); throw new AuthException(400, "Invalid or expired reset code"); }

    repository.updatePassword(userId, hasher.hash(newPassword));
    repository.deleteResetCode(userId);
    ...
}
```

- Checks that a code exists, has not expired, and matches (in constant time). A 6-digit code has only a million possibilities, so **wrong guesses are counted and locked** the same way as passwords; otherwise it could be brute-forced.
- On success: saves the new password hash and deletes the used code (it works once).
- **It no longer signs the user out.** Tokens are not stored, so there is nothing to delete. A token issued before the reset keeps working until it expires (at most 60 minutes). This is an accepted limitation of JWT, and the fix is a server-side "revoked tokens" list or a very short lifetime.

## 11b. `JwtService` - making and checking the token

This class is the heart of the sign-in. A **JWT** (JSON Web Token) is one line of text with three parts separated by dots:

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiI3Iiwi... . 5Wk3q...
     header                  payload            signature
```

- **Header:** which algorithm signed it (`HS256`).
- **Payload:** the facts ("claims"): who, role, expiry.
- **Signature:** a code computed from the first two parts and the secret.

The first two parts are only encoded, not encrypted, so **anyone can read them**. The signature is what stops anyone changing them: change one character and the signature no longer matches.

```java
public JwtService(@Value("${app.jwt.secret:}") String secret, @Value("${app.jwt.ttl-minutes:60}") long ttlMinutes) {
    byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < MIN_SECRET_BYTES) {
        throw new IllegalStateException("JWT_SECRET is missing or shorter than 32 characters. ...");
    }
    ...
}
```

- The secret is read from `app.jwt.secret`, which `application.properties` fills from `JWT_SECRET` in `employee-service/.env`.
- **The service refuses to start** if the secret is missing or under 32 characters. A weak or empty secret would let anyone forge a token, so failing loudly beats running unsafely.

```java
public LoginResult issue(User user) {
    Instant issuedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    Instant expiresAt = issuedAt.plus(lifetime);
    JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .issuer(ISSUER)
            .audience(AUDIENCE)
            .subject(String.valueOf(user.id()))
            .claim("email", user.emailAddress())
            .claim("role", user.role())
            .issueTime(Date.from(issuedAt))
            .expirationTime(Date.from(expiresAt))
            .build();
    SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
    jwt.sign(new MACSigner(secret));
    return new LoginResult(jwt.serialize(), expiresAt.toEpochMilli(), user);
}
```

Line by line:
- `lifetime` is 60 minutes (`app.jwt.ttl-minutes`). `expiresAt` is now plus that.
- The **claims** are the payload:

| Claim | Meaning |
|---|---|
| `iss` (issuer) | Who made the token: `payroll-capstone-employee-service` |
| `aud` (audience) | Who it is for: `payroll-capstone`. A token meant for some other app is rejected |
| `sub` (subject) | The user's id |
| `email`, `role` | The user's e-mail and role (`admin` or `member`) |
| `iat`, `exp` | Issued at, and expires at |

- `HS256` means HMAC with SHA-256: the signature is computed with one **shared secret**, the same one the other services use to check it.
- `jwt.sign(...)` produces the signature; `jwt.serialize()` joins the three parts into the final text. The method returns it with `expiresAt` in milliseconds, so the browser can set its own timer.

```java
public Optional<User> verify(String token) {
    if (token == null || token.isBlank() || token.length() > MAX_TOKEN_CHARS) return Optional.empty();
    try {
        SignedJWT jwt = SignedJWT.parse(token);
        if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm())) return Optional.empty();
        if (!jwt.verify(new MACVerifier(secret))) return Optional.empty();

        JWTClaimsSet claims = jwt.getJWTClaimsSet();
        Date expires = claims.getExpirationTime();
        ...
        if (expires == null || !expires.after(new Date())) return Optional.empty();
        if (!ISSUER.equals(claims.getIssuer()) || audience == null || !audience.contains(AUDIENCE)) return Optional.empty();
        if (subject == null || role == null || email == null) return Optional.empty();
        return Optional.of(new User(Long.parseLong(subject), email, role));
    } catch (ParseException | JOSEException | NumberFormatException ex) {
        return Optional.empty();
    }
}
```

The checks, in order. **Any** failure returns "nobody", with no details about why:
1. Missing, blank or absurdly long (over 2,048 characters): rejected.
2. `SignedJWT.parse` fails for text that is not a JWT.
3. **Only HS256 is accepted.** A token cannot choose its own algorithm. This blocks a classic attack where a forged token claims `"alg":"none"` (no signature at all) or a weaker method.
4. `jwt.verify(...)` recomputes the signature with the secret and compares. A changed payload, or a token signed with a different secret, fails here.
5. **Expiry:** the `exp` time must be in the future.
6. **Issuer and audience** must match this app.
7. The subject, e-mail and role must all be present.

The tests in `JwtServiceTests` cover each of these cases: a valid round trip, garbage, a changed payload (a member changed to an admin), another secret, an expired token, a wrong issuer or audience, an unsigned token and a weak secret.

## 12. `AuthInterceptor` and `WebConfig` - the doorman

```java
@Override
public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
    if ("OPTIONS".equals(request.getMethod())) return true;

    String token = BearerToken.from(request.getHeader("Authorization"));
    Optional<User> user = authService.authenticate(token);
    if (user.isEmpty()) return reject(response, 401, "Sign in required");
    if (!READ_ONLY.contains(request.getMethod()) && !AuthService.ROLE_ADMIN.equals(user.get().role())) {
        return reject(response, 403, "Admin access required");
    }
    return true;
}
```

- An **interceptor** runs before the controller. Returning `true` lets the request through; `false` stops it (the doorman already wrote the answer).
- `OPTIONS` requests pass: the browser sends these "may I?" checks before the real call (CORS), and they cannot carry a token.
- `BearerToken.from(...)` reads the `Authorization: Bearer <token>` header.
- **No valid token: 401.** A valid token but the request is not a read (`GET`/`HEAD`) and the user is not an admin: **403**. Otherwise it goes through.

```java
registry.addInterceptor(authInterceptor).addPathPatterns("/api/employees", "/api/employees/**");
```

- `WebConfig` says the doorman guards only the employee URLs. `/api/auth/...` stays open so people can sign in.

## 13. `AuthController` - the waiter for sign-in

```java
@PostMapping("/login")
public ResponseEntity<?> login(@Valid @RequestBody(required = false) LoginRequest input, BindingResult bindingResult) {
    if (input == null) return missingBody();
    if (bindingResult.hasErrors()) return invalid(bindingResult);
    return ResponseEntity.ok(service.login(input.emailAddress(), input.password()));
}
```

- Same pattern as the employee controller: no body gives 400, annotation problems give 400 with a message per field, otherwise call the service. `signUp`, `forgotPassword` and `resetPassword` look the same.
- The request classes carry their own rules: `SignUpRequest` and `ForgotPasswordRequest` require a `@pwc.com` e-mail (the pattern lives once in `AuthPatterns`), and passwords must be 8 to 100 characters. `LoginRequest` only requires that both fields are filled, so an old short password can still sign in.

```java
@ExceptionHandler(AuthException.class)
public ResponseEntity<?> handle(AuthException ex) {
    return ResponseEntity.status(ex.status()).body(Map.of("error", ex.getMessage(), "fieldErrors", ex.fieldErrors()));
}
```

- Any `AuthException` thrown by the chef (401 wrong details, 409 already registered, 429 locked, 400 bad code) is turned into the matching answer here.

```java
@PostMapping("/forgot-password")
...
    service.requestPasswordReset(input.emailAddress());
    return ResponseEntity.ok(Map.of("message", "If that e-mail is registered, a reset code has been created."));
```

- The answer is **identical whether or not the account exists**.
- This controller has four endpoints only. There is no `me` or `logout`: the other services verify the JWT themselves, and a JWT is not stored here.

## 14. `AdminSeeder` - the first administrator

```java
private static final String ADMIN_EMAIL = "vance.albert.reyes@pwc.com";
private static final String ADMIN_PASSWORD = "admin";

@Override
public void run(ApplicationArguments args) {
    if (repository.existsByEmail(ADMIN_EMAIL)) return;
    repository.insertUser(ADMIN_EMAIL, hasher.hash(ADMIN_PASSWORD), AuthService.ROLE_ADMIN);
}
```

- An `ApplicationRunner` runs once, right after the app starts. It creates the admin if missing.
- It hashes the password **in code**, so no password hash is written in a SQL file.
- This is why the admin returns after every restart, while accounts made by sign-up do not.
- **Weakness to mention:** the password `admin` is shorter than the 8 characters required of new passwords. Change it before real use.

---

# The resource files

## `application.properties` - settings

| Line | Meaning |
|---|---|
| `server.port=8081` | The port this service listens on |
| `spring.datasource.url=jdbc:h2:mem:employees;DB_CLOSE_DELAY=-1` | Use H2, an in-memory database called "employees". `DB_CLOSE_DELAY=-1` keeps it alive while the app runs |
| `spring.sql.init.mode=always` | Run `schema.sql` and `data.sql` every time the app starts |
| `spring.h2.console.enabled=false` | The browser page for looking inside the database is **switched off**: it has no login of its own and would expose the users table |
| `spring.config.import=optional:file:.env[.properties],optional:file:employee-service/.env[.properties]` | Also read settings from a `.env` file. Both paths are listed so it works whether you start the service from `employee-service` or from the repository root. `optional` means a missing file is not an error (the missing secret is, see below) |
| `app.jwt.secret=${JWT_SECRET:}` | The signing secret, taken from `JWT_SECRET` in `.env` (or the environment). The `:` with nothing after it means "empty if absent", which `JwtService` then refuses at start-up |
| `app.jwt.ttl-minutes=60` | How long a token stays valid. Change this to make tokens last shorter or longer |

**The `.env` file.** `employee-service/.env` holds one line, `JWT_SECRET=...`. It is git-ignored, so the secret is never committed. `.env.example` shows the key with an empty value. The same secret must be in `payroll-service/.env` and `ai-service/.env`.

**In-memory means "whiteboard":** fast and easy, but wiped when the service restarts.

## `schema.sql` - the table

```sql
CREATE SEQUENCE IF NOT EXISTS employee_code_seq START WITH 11;

CREATE TABLE IF NOT EXISTS employees (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    employee_code VARCHAR(32) DEFAULT ('EMP' || LPAD(CAST(NEXT VALUE FOR employee_code_seq AS VARCHAR), 3, '0')) NOT NULL UNIQUE,
    ...
```

- `id ... AS IDENTITY`: the database numbers rows automatically (1, 2, 3...).
- `employee_code ... DEFAULT (...)`: if no code is supplied, the database builds one: `'EMP'` + the next counter number padded to 3 digits. That counter is the `SEQUENCE`, which starts at 11 because the 10 sample employees already use EMP001-EMP010. The next new employee gets **EMP011**.
- `UNIQUE` means two employees can never share a code.

```sql
    position ... CHECK (position IN ('Associate', 'Senior Associate', 'Manager')),
    email_address ... CHECK (email_address LIKE '%@pwc.com'),
    contact_number ... CHECK (contact_number LIKE '+63%'),
    base_salary ... CHECK (base_salary > 0),
    CONSTRAINT chk_salary_by_position CHECK ( ...salary range per position... ),
    CONSTRAINT uq_employees_email UNIQUE (email_address),
    CONSTRAINT chk_email_lowercase CHECK (email_address = LOWER(email_address))
```

The `CHECK` lines repeat the main rules **inside the database**. This is "belt and braces": even if some other program wrote to the database and skipped the Java validation, bad data would still be refused.

The last two lines are about the **email address**:
- `UNIQUE (email_address)` makes it impossible for two employees to share an email. The database refuses the second one, however it arrives.
- `CHECK (email_address = LOWER(email_address))` only allows lowercase emails to be stored. This closes a loophole: `Ana.Cruz@pwc.com` and `ana.cruz@pwc.com` are different text, so `UNIQUE` alone would let both in. Since the service always lowercases the email before saving, the two rules together make the uniqueness case-insensitive.

## `data.sql` - sample data

Ten sample employees, `EMP001` to `EMP010`, loaded at every start. Each one obeys the rules above and has its own email, otherwise the service would refuse to start.

## `EmployeeServiceApplicationTests` - the one test

```java
@SpringBootTest
class EmployeeServiceApplicationTests {
    @Test
    void contextLoads() { }
}
```

The body is empty on purpose. The test passes only if the **entire application starts successfully** (all classes wired, SQL scripts valid). It is a basic "does it turn on?" check.

---

# Worked example: adding an employee

**Request**

```
POST http://localhost:8081/api/employees
{"fullName":"Dani Flores","position":"Associate","emailAddress":"dani@pwc.com",
 "contactNumber":"+639171112222","baseSalary":28000}
```

**What happens**
1. Spring turns the JSON into a `CreateEmployee`, trims the text fields, and runs the annotations. No format problems.
2. The controller sees the body is not empty and calls `validate`.
3. `validate` finds no problems: the position is allowed, `dani@pwc.com` is not used by anyone, and 28,000 is inside the Associate range of 20,000-60,000.
4. `create` lowercases the email and calls `insert`.
5. The database assigns `id` 11 and code `EMP011` (on a fresh start), then the row is read back.

**Answer: 201 Created**

```json
{"id":11,"employeeCode":"EMP011","fullName":"Dani Flores","position":"Associate",
 "emailAddress":"dani@pwc.com","contactNumber":"+639171112222","baseSalary":28000.00}
```

**A bad request**

```
{"fullName":"R2D2","position":"Intern","emailAddress":"x@gmail.com",
 "contactNumber":"0917","baseSalary":10.555}
```

**Answer: 400, with a message for every field at once**

```json
{ "error": "fullName may contain only letters and spaces (a period is allowed only in the suffix Jr. or Sr.); position must be one of: Associate, Senior Associate, Manager; emailAddress must be a valid address ending in @pwc.com; contactNumber must start with +63 followed by 10 digits, e.g. +639171234567; baseSalary can have at most 2 decimal places",
  "fieldErrors": {
    "fullName": "fullName may contain only letters and spaces (a period is allowed only in the suffix Jr. or Sr.)",
    "position": "position must be one of: Associate, Senior Associate, Manager",
    "emailAddress": "emailAddress must be a valid address ending in @pwc.com",
    "contactNumber": "contactNumber must start with +63 followed by 10 digits, e.g. +639171234567",
    "baseSalary": "baseSalary can have at most 2 decimal places" } }
```

All five fields fail, and all five are reported. The salary range was not checked because the position was invalid, and the salary already had a format error.

**A duplicate email**

```
{"fullName":"Dup Test","position":"Associate","emailAddress":"ANA.CRUZ@pwc.com",
 "contactNumber":"+639171112299","baseSalary":30000}
```

**Answer: 400**

```json
{ "error": "emailAddress is already used by another employee",
  "fieldErrors": { "emailAddress": "emailAddress is already used by another employee" } }
```

The capital letters make no difference: the email is lowercased and matches `ana.cruz@pwc.com`.

**Names with a suffix**

| Name | Result |
|---|---|
| `Dani Flores` | Accepted |
| `Dani Flores Jr.` / `Ana Cruz SR.` | Accepted (period allowed in the suffix) |
| `Dani Flores Jr` | Accepted (no period is fine) |
| `Dani. Flores` | Rejected (period not in a suffix) |
| `R2D2`, `Mary-Ann`, `O'Neil` | Rejected (only letters and spaces) |

# Try it live

Every employee call now needs a token, so sign in first and keep the token.

```powershell
# 1. Sign in as the administrator and keep the token
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/auth/login -ContentType 'application/json' `
  -Body '{"emailAddress":"vance.albert.reyes@pwc.com","password":"admin"}'
$h = @{ Authorization = "Bearer $($login.token)" }
$login.user          # id, emailAddress, role = admin

# 2. List employees (with the token)
Invoke-RestMethod http://localhost:8081/api/employees -Headers $h

# 3. Without a token: 401
try { Invoke-RestMethod http://localhost:8081/api/employees } catch { $_.ErrorDetails.Message }

# 4. Add one
Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/employees -Headers $h -ContentType 'application/json' `
  -Body '{"fullName":"Dani Flores","position":"Associate","emailAddress":"dani@pwc.com","contactNumber":"+639171112222","baseSalary":28000}'

# 5. Show every validation error at once
try { Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/employees -Headers $h -ContentType 'application/json' `
  -Body '{"fullName":"R2D2","position":"Intern","emailAddress":"x@gmail.com","contactNumber":"0917","baseSalary":10.555}' } catch { $_.ErrorDetails.Message }

# 6. Show the duplicate email error
try { Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/employees -Headers $h -ContentType 'application/json' `
  -Body '{"fullName":"Dup Test","position":"Associate","emailAddress":"ana.cruz@pwc.com","contactNumber":"+639171112299","baseSalary":30000}' } catch { $_.ErrorDetails.Message }
```

Now the member side:

```powershell
# 7. Sign up (always creates a member) and try to add an employee: 403
$member = Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/auth/signup -ContentType 'application/json' `
  -Body '{"emailAddress":"demo.member@pwc.com","password":"password123"}'
$m = @{ Authorization = "Bearer $($member.token)" }
Invoke-RestMethod http://localhost:8081/api/employees -Headers $m | Select-Object -First 2     # reading works
try { Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/employees -Headers $m -ContentType 'application/json' `
  -Body '{"fullName":"X Y","position":"Associate","emailAddress":"xy@pwc.com","contactNumber":"+639171112222","baseSalary":28000}' } catch { $_.ErrorDetails.Message }

# 8. Wrong password: 401. Do it 5 times to see the lock-out (429)
try { Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/auth/login -ContentType 'application/json' `
  -Body '{"emailAddress":"demo.member@pwc.com","password":"wrong"}' } catch { $_.ErrorDetails.Message }

# 9. Forgot password: then look in the employee-service console for "PASSWORD RESET CODE"
Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/auth/forgot-password -ContentType 'application/json' `
  -Body '{"emailAddress":"demo.member@pwc.com"}'
Invoke-RestMethod -Method Post -Uri http://localhost:8081/api/auth/reset-password -ContentType 'application/json' `
  -Body '{"emailAddress":"demo.member@pwc.com","code":"123456","newPassword":"newpassword1"}'   # use the real code
```

Failed requests make PowerShell throw an error, which is why those lines use `try`/`catch` to print the message the service sent. Careful with step 8: five wrong attempts lock that account for 15 minutes (a restart clears the lock).

Now show what is inside the token and why it cannot be altered:

```powershell
# 10. Look inside the JWT: the middle part is readable (it is only encoded, not secret)
$payload = $login.token.Split('.')[1].Replace('-','+').Replace('_','/')
$payload = $payload.PadRight($payload.Length + (4 - $payload.Length % 4) % 4, '=')
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
#   -> {"sub":"1","role":"admin","iss":"payroll-capstone-employee-service","aud":"payroll-capstone","exp":...,"iat":...,"email":"vance.albert.reyes@pwc.com"}

# 11. Change one character of the token: the signature no longer matches -> 401
$bad = $login.token.Substring(0, $login.token.Length - 2) + 'xx'
try { Invoke-RestMethod http://localhost:8081/api/employees -Headers @{ Authorization = "Bearer $bad" } } catch { $_.ErrorDetails.Message }
```

Step 10 is a good talking point: the contents are visible to anyone, but step 11 shows they cannot be changed. The same token is accepted by payroll-service and ai-service, because they hold the same secret.

**Before the demo:** restart the service (`mvn spring-boot:run` in `employee-service`) so you start from the 10 sample employees. The sample data and the unique-email rule are loaded only at startup, and any employee you added earlier is lost on restart.

**If you see `Unresolved compilation problems ... jakarta.validation cannot be resolved`:** the editor compiled a stale copy of `CreateEmployee` before it knew about the validation library. Stop the service, run **Java: Clean Java Language Server Workspace** in VS Code, then `mvn clean compile` and `mvn spring-boot:run`.

# Questions you may be asked

**Why validate in Java *and* in the database?** The Java side gives friendly, complete messages. The database is the last line of defense that no other program can bypass.

**Why are the format rules annotations and not code in the service?** Each rule sits right next to the field it protects, and the framework runs them. The service keeps only the rules that need other information (the database or another field).

**Why is the duplicate-email check in two places?** The service check gives a friendly message in the normal case. The database `UNIQUE` rule catches the rare case where two requests arrive at the same instant and both pass the check.

**Why does the form show every error at once?** The service sends a `fieldErrors` map with one message per field, so the screen can show each under its input, and the user fixes everything in one pass.

**Why is there no "update employee" feature?** It was not requested. It would be one new method in each layer: controller, service, repository.

**What happens to data when it restarts?** It resets to the 10 sample employees (in-memory database). Switching to a file or server database such as PostgreSQL would fix that.

**Why `BigDecimal` for salary?** `double` cannot represent values like 0.1 exactly. Money must be exact.

**Why return all errors at once?** Better user experience: fix everything in one pass.

**What if two people are given the same email?** It is refused. The service checks first and shows "emailAddress is already used by another employee". The database `UNIQUE` rule backs this up. Emails are compared in lowercase, so capitalization does not matter.

**Where are passwords stored?** Nowhere. Only a salted PBKDF2 hash is stored, and the database holds no way to turn it back into the password. If the database leaked, the passwords would still have to be guessed one at a time, slowly.

**Why a JWT and not a random token kept in the database?** A JWT is checked by its signature, so payroll-service and ai-service can verify it on their own, with no call to this service and no shared database. The cost is that it cannot be cancelled: it works until it expires.

**Can someone read what is in a JWT?** Yes. The payload is only encoded. Do not put secrets in it. What stops forgery is the signature, not hiding the contents.

**Can someone change their role inside the token?** They can edit the text, but the signature then no longer matches, and every service rejects it. Only someone who knows `JWT_SECRET` can create a valid admin token, which is why that secret must stay private.

**What happens when I log out?** The browser deletes the token. The token itself stays valid until its 60 minutes are up, so anyone who copied it could still use it. A real system would keep a list of cancelled tokens or use a much shorter lifetime.

**Why does the service refuse to start without `JWT_SECRET`?** An empty or short secret is trivially guessable, which would let anyone forge an admin token. Failing at start-up makes the mistake obvious instead of silently running unsafely.

**Why do wrong e-mails and wrong passwords give the same message?** So an attacker cannot learn which e-mails have accounts.

**Why is the reset code printed in the console?** There is no e-mail service in this demo. In a real system that one line would send an e-mail instead.

**Can someone sign up as an admin?** No. The sign-up request has no role field, and the service always creates a `member`. Admins can only be created by the seeder at startup (or directly in the database).

**Why does the interceptor let `OPTIONS` requests through?** Browsers send a "may I call this?" check first (called a pre-flight), and it cannot carry the token. The real request that follows is checked.

**Does a restart log everyone out?** No longer. Tokens are not stored, so a token issued before the restart still works until it expires, as long as the secret is unchanged. But accounts created by sign-up are lost on restart, so those users can no longer sign in again. Only the seeded admin is recreated.

**Can I use a name like Mary-Ann or O'Neil?** Not at the moment. Names may contain only letters and spaces, with a period allowed solely in a final `Jr.` or `Sr.` That is easy to relax by changing the one pattern on `fullName`, in `CreateEmployee` (and the matching check in the front end).

**Is the front end validating too?** Yes, the form checks the same rules before sending, so mistakes show up instantly. But the service never trusts the form: anyone can call the API directly, so every rule is enforced on the server.
