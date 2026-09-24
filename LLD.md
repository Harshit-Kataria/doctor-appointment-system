# CareDesk Low-Level Design

## 1. Implementation Overview

CareDesk is implemented with CommonJS on Node.js 22.13+. `server.js` contains database initialization, migrations, validation, authentication, API routing, and static serving. `app.js` contains the browser state, render functions, API client, event delegation, and form workflows. No external runtime packages are required.

## 2. Source Modules

| File | Detailed responsibility |
| --- | --- |
| `server.js` | Opens SQLite, creates/migrates tables, bootstraps the admin, hashes credentials, authenticates tokens, validates input, handles REST routes, and serves frontend files. |
| `app.js` | Holds client collections and current view/filter state; renders authentication and management screens; submits JSON requests; stores the session token in `sessionStorage`. |
| `index.html` | Defines the application shell, sidebar, top bar, modal/toast roots, and loads frontend assets. |
| `styles.css` | Provides desktop/mobile layouts, tables, forms, modals, status badges, authentication screens, and responsive breakpoints. |
| `seed.js` | Adds three fictional doctors, three fictional patients, and three same-day appointments only when the directories are empty. |
| `test/server.test.js` | Creates a temporary `DATA_DIR`, runs the actual server, and verifies authentication, CRUD, conflict detection, referential protection, and tenant isolation. |

## 3. Server Functions

### Database initialization

- `fs.mkdirSync(dataDir, { recursive: true })` ensures the storage directory exists.
- `new DatabaseSync(.../caredesk.sqlite)` opens the database.
- `PRAGMA foreign_keys = ON` activates referential checks.
- `CREATE TABLE IF NOT EXISTS` is used for repeatable startup.
- The startup migration inspects each business table with `PRAGMA table_info`, adds `ownerId` to legacy tables if missing, assigns legacy rows to the original admin, and creates owner indexes.

### Utility functions

- `id()` returns a UUID through `crypto.randomUUID()`.
- `passwordHash(password)` creates a 16-byte random salt and a 32-byte PBKDF2-SHA256 digest using 150,000 iterations. The stored form is `saltHex:hashHex`.
- `verifyPassword(password, saved)` derives the candidate hash and compares buffers with `crypto.timingSafeEqual`.
- `readBody(req)` reads at most 100,000 characters and parses JSON.
- `json()` and `error()` standardize JSON output and apply `Cache-Control: no-store`.
- `userFromRequest(req)` hashes the bearer token and joins `sessions` to `users`, requiring `expires_at > Date.now()`.
- `validate(type, input, ownerId, recordId)` normalizes fields and applies resource-specific rules.

## 4. Data Schema

### `users`

| Column | Type/constraint | Meaning |
| --- | --- | --- |
| `id` | TEXT, primary key | UUID account identifier. |
| `email` | TEXT, unique, not null | Normalized lowercase sign-in address. |
| `password_hash` | TEXT, not null | Salt and PBKDF2 digest; raw passwords are never stored. |
| `role` | TEXT, not null | `admin` for the bootstrap user or `owner` for self-registration. |

### `sessions`

| Column | Type/constraint | Meaning |
| --- | --- | --- |
| `token_hash` | TEXT, primary key | SHA-256 digest of the bearer token. |
| `user_id` | TEXT, FK → `users.id`, not null | Session owner. |
| `expires_at` | INTEGER, not null | Expiration as Unix time in milliseconds. |

### `doctors`

`id` (PK), required `name`, required `specialty`, optional `email`, optional `phone`, and `ownerId` (FK → users). An index on `ownerId` supports private collection queries.

### `patients`

`id` (PK), required `name`, optional `email`, `phone`, `dob`, and `notes`, plus `ownerId` (FK → users). An index on `ownerId` supports private collection queries.

### `appointments`

`id` (PK), `patientId` (required FK), `doctorId` (required FK), required `date`, `time`, `duration`, and `status`, optional `reason`, and `ownerId` (FK → users). The `appointment_schedule` index covers `(date, time, doctorId)` and an additional index covers `ownerId`.

Appointments use `ON DELETE RESTRICT` for patient and doctor references.

## 5. API Contracts

All bodies and successful/error responses use JSON. Authenticated routes require `Authorization: Bearer <token>`.

### Authentication

| Method and path | Request | Success | Common errors |
| --- | --- | --- | --- |
| `POST /api/signup` | `{ "email": string, "password": string }` | `201 { token, user: { email, role: "owner" } }` | `400` invalid email/password; `409` duplicate account. |
| `POST /api/login` | `{ "email": string, "password": string }` | `200 { token, user: { email, role } }` | `401` incorrect credentials. |
| `GET /api/me` | Bearer token | `200 { user: { id, email, role } }` | `401` missing/expired/invalid session. |
| `POST /api/logout` | Bearer token | `200 { ok: true }` | `401` unauthenticated. |

Sign-up and login create a seven-day session. Logout deletes the stored token hash.

### Resource collections

`{resource}` is `doctors`, `patients`, or `appointments`.

| Method and path | Behavior |
| --- | --- |
| `GET /api/{resource}` | Returns an array containing only the authenticated user's records. |
| `POST /api/{resource}` | Validates and creates a record with a server-generated UUID and authenticated `ownerId`; returns `201`. |
| `PUT /api/{resource}/{id}` | Requires an owned record, validates the full replacement payload, and returns the updated record. |
| `DELETE /api/{resource}/{id}` | Deletes an owned record; doctor/patient deletion returns `409` while linked appointments exist. |

### Payload shapes

```json
{
  "name": "Dr. Maya Sharma",
  "specialty": "General Medicine",
  "email": "maya@example.com",
  "phone": "555-0101"
}
```

```json
{
  "name": "Aarav Patel",
  "email": "aarav@example.com",
  "phone": "555-0201",
  "dob": "1991-04-12",
  "notes": ""
}
```

```json
{
  "patientId": "uuid",
  "doctorId": "uuid",
  "date": "2026-12-15",
  "time": "10:00",
  "duration": 30,
  "status": "scheduled",
  "reason": "Routine consultation"
}
```

## 6. Validation Rules

### Accounts

- Email is trimmed, lowercased, checked with the server's email pattern, and limited to 200 characters.
- Password length is 8–128 characters.
- User email is unique.

### Doctors and patients

- Name is required and at most 100 characters.
- Optional email must match the email pattern and be at most 200 characters.
- Phone is at most 30 characters.
- Doctor specialty is required.
- Patient date of birth, when supplied, must be `YYYY-MM-DD` and parse as a date.
- Patient notes are at most 2,000 characters.

### Appointments

- Patient and doctor IDs must exist and belong to the current user.
- Date must be `YYYY-MM-DD`; time must be a valid 24-hour `HH:MM` value.
- Duration must be one of 15, 30, 45, 60, or 90 minutes.
- Status must be `scheduled`, `completed`, `cancelled`, or `no-show`.
- Reason is at most 300 characters.
- Cancelled appointments do not participate in conflict checking.

### Conflict algorithm

Times are converted to minutes after midnight. For proposed interval `[start, end)` and existing interval `[otherStart, otherEnd)`, overlap exists when:

```text
start < otherEnd AND end > otherStart
```

The request is rejected if an overlapping, non-cancelled appointment has either the same `doctorId` or the same `patientId`. On updates, the current appointment ID is excluded.

## 7. Frontend Design

### State

The client maintains `db.doctors`, `db.patients`, `db.appointments`, active `view`, search `query`, and appointment `statusFilter`. `refresh()` loads all three collections concurrently.

### Rendering

- `renderDashboard()` calculates today's and upcoming appointments in the browser.
- `renderAppointments()` applies text and status filters.
- `renderPeople(type)` renders doctor/patient directories.
- Modal helpers produce forms and detail/delete views.
- Event delegation on `document` handles navigation, CRUD actions, authentication, filtering, modal closure, and form submission.

### Authentication state

The token is stored under `caredesk-session` in `sessionStorage`. An API `401` clears the token and returns the user to sign-in. Logout calls the server and clears the browser token even if the request fails.

## 8. Authorization and Security

- All record reads and mutations are scoped by `ownerId` on the server; client-side filtering is not trusted.
- Appointment relationship checks also require the same owner, preventing cross-account identifier use.
- SQL values use prepared statement placeholders.
- Token values are never persisted in plaintext on the server.
- Responses include `Cache-Control: no-store`; static responses include `X-Content-Type-Options: nosniff`.
- The database and `.env` are excluded through `.gitignore`.

Current limitations: no rate limiting, CSRF defense beyond bearer-token use, security headers beyond `nosniff`, password reset, session revocation UI, or audit trail.

## 9. Error Handling

All API errors use `{ "error": "message" }`.

| Status | Meaning in this application |
| --- | --- |
| `400` | Invalid JSON, oversized body, validation failure, invalid relationship, or schedule conflict. |
| `401` | Missing/invalid/expired bearer session or incorrect login credentials. |
| `404` | Unknown route/resource or record not owned by the current user. |
| `405` | Recognized route with an unsupported method. |
| `409` | Duplicate account or doctor/patient with linked appointments. |
| `500` | Unexpected server exception; internal details are logged, and a generic response is returned. |

The browser shows authentication/form errors inline and operation feedback through toast messages.

## 10. Test Design

`npm test` runs three HTTP-level scenarios:

1. Protected resources reject anonymous requests; incorrect login fails; valid login and `/api/me` succeed.
2. Doctor, patient, and appointment CRUD works; an overlapping appointment fails; linked patient deletion fails; status update and ordered cleanup succeed.
3. Self-registration works, duplicate email fails, new workspaces start empty, and one account cannot read, delete, or reference another account's records.

Tests use a temporary database directory and remove it after the server closes, so application data is never touched.

