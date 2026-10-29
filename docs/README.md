# Payroll AI Capstone - Presentation Guide

## The app in three sentences

0. You **sign in** with your company e-mail. Administrators manage everything; members can look but not change.
1. You keep a **directory of employees** (name, position, email, contact number, salary, photo).
2. You **run payroll** for an employee for a month. The app adds overtime, subtracts Philippine contributions and tax, and shows a payslip.
3. **OpenAI** reviews saved payroll runs and marks the unusual ones for a human to look at. A **chat assistant** in the corner also answers questions using only the app's own data.

## The four pieces

| Piece | Language | Port | What it is responsible for | Guide |
|---|---|---|---|---|
| employee-service | Java (Spring Boot) | 8081 | Employee records and their validation, **plus user accounts and sign-in (it issues the JWT tokens)** | [employee-service.md](employee-service.md) |
| payroll-service | Node.js (Express) | 3001 | Payroll calculation, payroll history, employee photos in AWS S3. Checks every request's token | [payroll-service.md](payroll-service.md) |
| ai-service | Python (FastAPI) + OpenAI | 8000 | Flags unusual payroll runs and powers the chat assistant. Checks every request's token | [ai-service.md](ai-service.md) |
| frontend | React | 5173 | The screens you click on (not covered by these guides) | - |

Each backend is a **microservice**: a small program that does one job and talks to others over HTTP. They are written in three different languages on purpose, to show that services only need to agree on the *messages* they send each other, not on the technology inside.

## The big picture

```
                    +----------------------+
                    |   Browser (React)    |
                    +---+-------+-------+--+
                        |       |       |
       employees        |       |       |       "is this payroll
       (add / list /    |       |       |        run unusual?"
        delete)         |       |       |
                        v       |       v
            +--------------+    |    +-------------+
            | employee-    |    |    | ai-service  |
            | service :8081|    |    |    :8000    |
            |   (Java)     |    |    |  (Python)   |
            +------^-------+    |    +-------------+
                   |            v
                   |   +------------------+
                   +---| payroll-service  |--------> AWS S3
          "what is     |      :3001       |          (employee photos)
           this        |    (Node.js)     |
           person's    +--------+---------+
           salary?"             |
                                v
                      payroll-runs.json
                      (saved payroll history)
```

How to read it:
- The **browser talks to each service directly**, and sends its **sign-in token** with every request.
- **employee-service is also the sign-in office.** It keeps the user accounts and **issues the sign-in token**, a signed JWT. payroll-service and ai-service keep no accounts and **do not call anyone to check a token**: each one verifies the signature itself, using a secret (`JWT_SECRET`) that all three share.
- payroll-service asks employee-service "what is employee 7's salary?" when it runs payroll or saves a photo.
- ai-service has two outside connections. For **chat**, it fetches the current employees and payroll runs from the other two services, so answers come from live data. For **review and chat**, it calls the **OpenAI** cloud API.
- The diagram above leaves out those arrows from ai-service to keep it readable.

## One idea explains every service: the restaurant

All three backends are built in **layers**, and each layer has one job. Think of a restaurant.

| Layer | Restaurant | What it does | Java name | Node name | Python name |
|---|---|---|---|---|---|
| Entry point | **Waiter** | Takes the order, brings back the answer. Does not cook. | Controller | routes + controllers | api |
| Rules | **Head chef** | Checks the order against the house rules, does the real work | Service | services | services |
| Storage | **Storeroom clerk** | Fetches and stores ingredients. Knows nothing about customers. | Repository | repositories | (none needed) |
| The data | **The dish / the order slip** | The shape of what comes in and goes out | model, dto | plain objects | schemas |

Why bother? Each layer can change without touching the others. For example, changing a salary rule only touches the chef; changing the database only touches the storeroom clerk.

A request always flows **down** through the layers and the answer flows back **up**:

```
Customer (browser)  ->  Waiter (controller)  ->  Chef (service)  ->  Storeroom (repository)
                    <-                       <-                  <-
```

## How sign-in works (the stamped pass)

Think of a pass with a tamper-proof stamp. You show your password once and get a pass that says who you are and what you may do ("Ana, admin, valid until 3 pm"), stamped by the sign-in office. Any other office can check the stamp **on its own** without phoning the sign-in office, and a pass someone has altered or forged fails the stamp check.

```
1. Sign in      browser  --e-mail + password-->  employee-service
                         <--JWT (60 minutes)----  signed with the shared secret
2. Every call   browser  --JWT-->  any service   the service checks the signature, expiry and role itself
3. Decide       401 = missing, forged or expired      403 = valid, but not an admin      OK = go ahead
```

| Idea | What it means here |
|---|---|
| **Password storage** | Passwords are never stored. Only a scrambled version (a salted hash) is, so even someone who reads the database cannot read the passwords |
| **Token (JWT)** | A JSON Web Token: three text parts joined by dots (header, payload, signature). The payload holds the user's id, e-mail and role and an expiry time. It is **signed** with the shared secret, not encrypted, so anyone can read it but nobody can change it without breaking the signature. Valid for 60 minutes |
| **Shared secret** | `JWT_SECRET`, at least 32 characters, in each service's `.env` file. Whoever has it can create a token for any user, so it must never be committed or shared |
| **Roles** | `admin` can add and delete employees, run payroll, change photos and check AWS. `member` can view employees and payroll, run the AI review and use the chat |
| **Sign up** | Anyone with a `@pwc.com` address can create an account, and it is always a `member`. Nobody can sign up as an admin |
| **Forgot password** | Creates a 6-digit code valid for 15 minutes. There is no e-mail service, so the code is printed in the employee-service console |
| **Lock-out** | After 5 wrong attempts, that account is locked for 15 minutes |

The first administrator is created at startup: `vance.albert.reyes@pwc.com` with the password `admin`.

## The status codes you will hear

| Code | Meaning | Example in this app |
|---|---|---|
| 200 | OK | Employee list returned |
| 201 | Created | New employee or payroll run saved |
| 204 | Done, nothing to send back | Employee deleted |
| 400 | You sent something invalid | Salary outside the allowed range |
| 401 | Not signed in | Missing, wrong or expired token |
| 403 | Signed in, but not allowed | A member tries to add an employee |
| 404 | Not found | Employee id does not exist |
| 409 | Conflict | Payroll for that employee and month already exists; e-mail already registered |
| 429 | Too many attempts | Account locked after 5 wrong passwords |
| 413 | Too big | Photo over 2 MB |
| 500 | Our bug | Unexpected crash |
| 502 | Another service failed | Employee service is down while running payroll |
| 503 | Service unavailable | Photo storage (S3) is not reachable |

Rule of thumb: **4xx = the caller made a mistake, 5xx = the server (or a service behind it) had a problem.**

## Glossary

| Term | Plain meaning |
|---|---|
| API / endpoint | A URL you can send a request to, such as `GET /api/employees` |
| REST | A style where URLs are things (`/employees`) and the method says the action (GET = read, POST = create, DELETE = remove) |
| JSON | The text format the services use to send data, like `{"fullName": "Ana"}` |
| CORS | A browser safety rule. Each service says "only the app on port 5173 may call me" |
| Validation | Checking input before accepting it |
| Authentication | Proving who you are (signing in) |
| Authorization | Deciding what you are allowed to do (admin or member) |
| Hash / salt | A one-way scramble of a password. The salt is random extra text added first, so two people with the same password get different scrambles |
| Token | The pass you get after signing in, sent with every request |
| JWT | JSON Web Token: a token that carries who you are and an expiry, with a signature that proves it was not changed |
| Signature | A code made from the token's contents and the secret. Change one character of the contents and the code no longer matches |
| Claim | One fact inside a JWT, such as the user's role or the expiry time |
| Dependency injection | A class does not create its helpers; the framework hands them in. This is why controllers have a constructor that takes a service |
| Middleware | Code that every request passes through on the way in (for example, "read the JSON body") |
| In-memory database | Data lives in RAM. Fast, but wiped on restart |
| S3 | Amazon's file storage. Files live in a "bucket" |
| Signed URL | A temporary web link to a private file that stops working after a few minutes |
| Anomaly / outlier | A record that looks different from the usual ones |
| Machine learning model | A program that learned patterns from example data instead of following hand-written rules |

## Suggested talk order (about 15 minutes)

| Time | Topic | What to show |
|---|---|---|
| 2 min | The app and the diagram above | The big picture and the restaurant table |
| 4 min | employee-service | Follow one "add employee" request through the three layers; show the validation errors |
| 5 min | payroll-service | The worked payroll example with tax, then the photo upload flow |
| 3 min | ai-service | Rules plus OpenAI review; then the chat, including one off-topic question it declines |
| 1 min | Limitations | The honest list below |

Each service guide has a **"Try it live"** section with commands you can paste during the demo, and a **"Questions you may be asked"** section.

## Honest limitations (good to say out loud)

- **Employees are stored in memory.** They reset to 10 sample employees on every restart of employee-service. A real system would use a persistent database.
- **Because of that, employee IDs restart too.** Saved payroll runs and S3 photos keep the old IDs, so after a restart they could point at a different person.
- **Accounts live in the same in-memory database as employees.** A restart removes every account created by sign-up. Only the seeded admin comes back. A token a user already holds can still be used until it expires, even after their account has vanished.
- **A JWT cannot be cancelled.** Signing out only makes the browser forget the token, and a password reset does not end tokens already issued. A copied token works until its 60 minutes are up. The same applies to a role change.
- **One shared secret signs every token.** `JWT_SECRET` must be identical in all three services, at least 32 characters, and kept out of git (all three `.env` files are ignored). Anyone who learns it can forge an admin token, so rotate it if it leaks (this signs everyone out).
- **The admin's starting password is short (`admin`).** New passwords must be 8 characters or more, so change this one before real use.
- **Forgot password has no e-mail.** The reset code is printed in the employee-service console. A real system would send it by e-mail.
- **Traffic is plain HTTP** on localhost. A real system needs HTTPS so tokens cannot be read on the network.
- **Sign-up is open to any `@pwc.com` address**, with no e-mail confirmation.
- **Tax and contribution rates are demo values** and change often. Confirm them with the SSS, PhilHealth, Pag-IBIG and BIR before real use.
- **The AI review and chat send data to OpenAI.** Review sends salary numbers only; chat also sends employee names, emails, phone numbers and salaries. Check this is acceptable before using real data, and keep the API key in `.env`, never in the code.
- **The chat's "only answer from the data" rule is enforced by instructions to the model**, not by code. It is reliable with `temperature=0`, but test it with off-topic questions before presenting.
- **The AI review is a second opinion, not a fraud verdict.** A person decides what to do with a flagged record.
