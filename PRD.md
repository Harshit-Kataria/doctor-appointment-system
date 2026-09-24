# CareDesk Product Requirements Document

## 1. Product Summary

CareDesk is a web application for a small medical practice to manage its doctor directory, patient records, and appointment schedule from one private workspace. It replaces fragmented paper notes or disconnected spreadsheets with a consistent scheduling workflow and a dashboard that shows current practice activity.

## 2. Problem Statement

Small practices need a simple way to answer four daily questions:

1. Which doctors and patients are registered in this practice?
2. Which appointments are scheduled today and in the future?
3. Has a doctor or patient already been booked during the requested time?
4. Can staff update or remove records without breaking appointment relationships?

Generic calendars do not maintain patient/doctor records or enforce both sides of a medical booking. Large clinical platforms are too complex for a college capstone and small-practice demonstration. CareDesk provides the essential workflow in one focused application.

## 3. Target Users

### Primary user: practice owner or administrator

- Creates and signs into a private account.
- Maintains doctor and patient directories.
- Creates and updates appointments.
- Tracks scheduled, completed, cancelled, and missed visits.

### Secondary evaluator: college instructor or recruiter

- Reviews a complete full-stack capstone.
- Can run the application locally, seed fictional data, and verify automated tests.
- Can inspect authentication, API, persistence, responsive UI, and business rule implementation.

### Not a user in the current release

Doctors and patients do not have direct portal accounts. Practice staff manage their records.

## 4. Product Goals

- Provide a clean, responsive practice dashboard.
- Support complete doctor, patient, and appointment record management.
- Prevent overlapping appointments for both a doctor and a patient.
- Keep each registered account's business records private from other accounts.
- Persist records across server restarts with relational integrity.
- Demonstrate full-stack design with no third-party runtime dependencies.
- Be easy to run, seed, test, explain, and present as a capstone project.

## 5. Success Measures

- A new user can create an account and reach an empty private workspace.
- The user can add a doctor and patient, then schedule an appointment between them.
- Dashboard totals and today's schedule update after record changes.
- Conflicting bookings are rejected with a clear message.
- A second account cannot access or reference the first account's records.
- Linked doctors/patients cannot be deleted until their appointments are removed.
- The documented automated tests pass on Node.js 22.13+.

## 6. Functional Requirements

### FR-1 Account registration

- The product shall allow a user to register with an email and password.
- Email shall be normalized and unique.
- Password shall contain 8–128 characters.
- Successful registration shall create a private workspace and sign the user in.

### FR-2 Authentication and sessions

- The product shall support email/password sign-in and explicit sign-out.
- Protected resources shall require a valid bearer session.
- Sessions shall expire after seven days.
- Invalid or expired sessions shall return the user to the sign-in screen.

### FR-3 Workspace isolation

- Each doctor, patient, and appointment shall belong to one account.
- A user shall list, update, or delete only records they own.
- Appointment references shall accept only doctors and patients in the same workspace.

### FR-4 Doctor directory

- Staff shall add a doctor with name, specialty, and optional contact information.
- Staff shall view, search, edit, and delete doctors.
- Name and specialty shall be required.
- A doctor with linked appointments shall not be deletable.

### FR-5 Patient directory

- Staff shall add a patient with name and optional email, phone, date of birth, and notes.
- Staff shall view, search, edit, and delete patients.
- Patient name shall be required.
- A patient with linked appointments shall not be deletable.

### FR-6 Appointment management

- Staff shall create an appointment by choosing an existing doctor and patient.
- Staff shall provide a date, time, duration, status, and optional reason.
- Supported durations shall be 15, 30, 45, 60, and 90 minutes.
- Supported statuses shall be scheduled, completed, cancelled, and no-show.
- Staff shall view, search, filter, edit, and delete appointments.

### FR-7 Schedule conflict prevention

- The system shall reject overlapping non-cancelled appointments for the same doctor.
- The system shall reject overlapping non-cancelled appointments for the same patient.
- Adjacent appointments whose end and start times are equal shall be allowed.
- Updating an appointment shall exclude that appointment from its own conflict check.
- Cancelled appointments shall not block a time slot.

### FR-8 Dashboard

- The dashboard shall show today's appointment count, upcoming visits, total patients, and active doctors.
- It shall show today's appointments and a chronological daily schedule.
- It shall provide quick navigation to create an appointment or open management views.

### FR-9 Search and filtering

- Doctor and patient lists shall support text search.
- Appointment search shall match patient, doctor, or reason.
- Appointments shall be filterable by status.

### FR-10 Demonstration data

- A seed command shall add fictional sample doctors, patients, and appointments only when both directories are empty.
- Seeded records shall belong to the bootstrap administrator.

## 7. Nonfunctional Requirements

### NFR-1 Security

- Passwords shall be stored only as salted PBKDF2-SHA256 hashes.
- Server sessions shall store token hashes rather than raw bearer tokens.
- SQL operations shall use parameterized statements.
- Authorization shall be enforced by the server for every protected record operation.
- Real database files, logs, dependencies, and environment secrets shall not be committed to version control.
- Public deployment shall use HTTPS and non-default administrator credentials.

### NFR-2 Data integrity

- SQLite foreign keys shall be enabled.
- User email shall be unique.
- Appointment doctor and patient references shall be valid.
- Deleting referenced doctors or patients shall be prevented.

### NFR-3 Usability and accessibility

- The interface shall adapt to desktop and mobile widths.
- Forms shall use labels, required fields, keyboard-closeable modals, and visible feedback.
- Statuses shall use text in addition to color.
- Empty states shall explain the next action.

### NFR-4 Performance

- The three primary collections should load concurrently after authentication.
- Common ownership and schedule queries shall have database indexes.
- The system targets a single small practice and local/capstone-scale datasets.

### NFR-5 Reliability and testability

- Records shall persist in SQLite across application restarts.
- Tests shall use isolated temporary storage.
- Authentication, core CRUD, conflicts, deletion protection, and account isolation shall have automated HTTP-level coverage.

### NFR-6 Maintainability

- Setup and operation shall be documented in `README.md`.
- Product, architecture, and implementation decisions shall be documented in `PRD.md`, `HLD.md`, and `LLD.md`.
- The runtime shall rely on built-in Node.js modules to minimize dependency maintenance.

## 8. Acceptance Criteria

### AC-1 Registration and privacy

**Given** no account exists for an email, **when** a user registers with a valid password, **then** a seven-day session is returned and the workspace opens empty. A second account cannot list, delete, or use the first account's records.

### AC-2 Doctor and patient setup

**Given** an authenticated user, **when** they create valid doctor and patient records, **then** those records appear in the corresponding searchable directories and dashboard counts update.

### AC-3 Appointment creation

**Given** an owned doctor and patient, **when** the user submits a valid appointment, **then** it appears in the appointment list and appropriate dashboard/schedule sections.

### AC-4 Conflict rejection

**Given** a scheduled 30-minute appointment at 10:00, **when** the same doctor or patient is booked at 10:15 on the same date, **then** the API returns HTTP 400 with a specific conflict message and does not create the record.

### AC-5 Allowed adjacency and cancellation

**Given** a 10:00–10:30 appointment, a new appointment at 10:30 shall be accepted. If the first appointment is cancelled, its original interval shall no longer block another booking.

### AC-6 Relationship protection

**Given** a patient or doctor referenced by an appointment, **when** deletion is requested, **then** the API returns HTTP 409 and instructs the user to delete linked appointments first.

### AC-7 Authentication failure

Anonymous requests to record endpoints shall return HTTP 401. Incorrect credentials shall return HTTP 401 without disclosing whether the account exists.

### AC-8 Automated validation

Running `npm test` shall execute the authentication, CRUD/conflict, and account-isolation test scenarios using temporary storage without modifying application data.

## 9. Current Release Scope

### Included

- Self-registration, sign-in, sign-out, and session validation.
- Private per-account doctor, patient, and appointment records.
- CRUD interfaces and REST endpoints.
- Dashboard, search, appointment status filter, and responsive design.
- Server-side validation, schedule conflict detection, and linked-record safeguards.
- SQLite persistence, optional fictional seed data, README, and automated tests.

### Excluded

- Patient and doctor self-service portals.
- Appointment reminders, email, SMS, or calendar integrations.
- Recurring appointments, availability templates, waiting lists, billing, prescriptions, or clinical file uploads.
- Password reset, email verification, multifactor authentication, and detailed role permissions.
- Audit logs, encryption key management, managed backups, and formal healthcare compliance certification.
- Cloud database support and horizontal multi-instance scaling.

## 10. Dependencies and Assumptions

- Node.js 22.13+ is available because the project uses `node:sqlite`.
- The deployment provides persistent writable storage for the SQLite database.
- Practice staff use modern browsers with JavaScript and `sessionStorage` enabled.
- Dates and times are entered as local practice values; timezone conversion is outside this release.
- Seed data is fictional and intended only for demonstrations.

## 11. Future Improvements

1. Add password reset, verified email, MFA, session management, and login rate limiting.
2. Add staff roles and permissions for administrators, receptionists, doctors, and read-only users.
3. Add doctor availability, holidays, recurring schedules, appointment reminders, and calendar integration.
4. Add audit events for access and record changes, encrypted backups, retention controls, and compliance hardening.
5. Move persistence to a managed relational database for multi-instance cloud deployment.
6. Add pagination, server-side filtering, reporting, exports, and analytics for larger practices.
7. Expand automated coverage for boundary times, malformed input, session expiry, UI flows, accessibility, and load behavior.
8. Add production monitoring, structured logging, health checks, and automated deployment pipelines.

