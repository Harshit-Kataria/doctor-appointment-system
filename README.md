# CareDesk — Doctor Appointment & Patient Management System

A full-stack college capstone project for a small medical practice. Staff can sign in, manage patient and doctor records, schedule appointments, and track visit status through a responsive dashboard.

## Features

- Account creation and sign-in with salted PBKDF2 password hashes and expiring server-side sessions
- Private workspace for each account, with server-side record ownership checks
- Patient and doctor directories with search, editing, and deletion safeguards
- Appointment scheduling with 15–90 minute durations and server-side overlap checks for both doctors and patients
- Appointment status tracking: scheduled, completed, cancelled, and no-show
- Dashboard showing today's schedule and practice totals
- SQLite persistence, REST API, responsive interface, and zero third-party runtime dependencies

## Run locally

Install **Node.js 22.13 or newer**, then from this folder run:

```text
npm run seed
npm start
```

Open **http://localhost:3000**. The demo login is **admin@caredesk.local** / **Admin@123**. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first run to choose different credentials. The account is created only when the database has no users.

The `seed` command adds fictional sample records only if both directories are empty. You can skip it and create your own records through the interface.

Data is stored in `data/caredesk.sqlite`. Back up this file to preserve your records. Keep this database file private when sharing the project.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/login` | Sign in |
| POST | `/api/signup` | Create a private account |
| POST | `/api/logout` | End session |
| GET | `/api/me` | Current user |
| GET, POST | `/api/doctors`, `/api/patients`, `/api/appointments` | List or create |
| PUT, DELETE | `/api/{resource}/{id}` | Update or delete |

All record endpoints require `Authorization: Bearer <token>`. Each account can access only its own records. API input is validated on the server. Linked patients and doctors cannot be removed while appointments reference them.

## Architecture

The browser UI is plain HTML, CSS, and JavaScript. A Node.js HTTP server handles authentication and the REST API. SQLite stores users, sessions, doctors, patients, and appointments. Foreign keys protect relationships, and the scheduling rule runs on the server so it applies to every client.

## Tests

Run `npm test` to check authentication, CRUD, and appointment conflict handling. Tests use a temporary database and do not touch your application records.

## Capstone scope

This is a local demonstration project with fictional data. Before use in a real clinic, add role-based permissions, audit logs, encrypted backups, stronger account management, HTTPS deployment, and applicable privacy controls.

## Resume description

**CareDesk — Doctor Appointment & Patient Management System**  
Built a full-stack scheduling application with Node.js, SQLite, and vanilla JavaScript. Implemented authenticated REST APIs, patient and doctor CRUD, appointment status tracking, relational data integrity, and overlap prevention for both clinician and patient schedules. Added a responsive dashboard and automated API tests.
