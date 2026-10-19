# SmartComplaint

AI-assisted complaint management system built with MongoDB, Express, React, and Node.js. Customers submit and track support tickets, local AI classifies and routes them, support staff respond and update status, and administrators manage queues and review analytics.

## Problem statement

Customer complaints can be difficult to categorize, prioritize, route, and track consistently. SmartComplaint brings these steps into one authenticated application with ticket history and role-specific workspaces.

## Objectives

- Give customers a clear way to submit complaints and follow progress.
- Use a locally hosted language model to suggest a category, priority, department, confidence, and explanation.
- Route requests to support staff by department and workload.
- Let staff communicate with customers and progress tickets through a controlled status flow.
- Give administrators queue, user, department, and analytics views.
- Keep attachments private and validate their type, signature, and size.

## Features

- Customer registration, login, logout, profile, dashboards, complaint search and filters.
- Complaint ticket IDs, status history, comments, AI result details, and department routing.
- PDF, JPG, and PNG attachments up to 5 MB; generated private storage names; authenticated open/download endpoints.
- Support staff department queue sorted by priority, filters, responses, and status changes.
- Admin dashboards, complaint assignment and status management, user listing, department counts, and reports.
- Optional SMTP notifications for submission, assignment, status changes, and resolution. Email errors do not undo saved complaints. The SMTP diagnostic commands are disabled in production.
- Light/dark theme and responsive pages.

## AI functionality

The backend sends the complaint subject and description to Ollama using `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. It validates the returned category, priority, department, confidence (0-1), and explanation before saving. If Ollama is unavailable or returns invalid output, the complaint remains saved and is marked as a fallback for support review. AI output is a suggestion and can be wrong; staff should review it.

Supported categories include payment, technical, delivery, product, account/login, refund, service, security, general, and other. Supported departments are Finance Support, Technical Support, Delivery/Logistics, Product Support, Account Support, Customer Support, and Security Team.

## Technology stack

- Frontend: React, Vite, React Router, Axios, Recharts, React Icons, CSS.
- Backend: Node.js, Express, Mongoose, MongoDB, Multer, Nodemailer.
- Authentication: bcrypt password hashing, signed JWT in an HTTP-only cookie, role middleware.
- AI: Ollama local HTTP API (default model `llama3.2:3b`).

## System architecture

```text
Browser (React/Vite)
  | HTTP + HTTP-only auth cookie
  v
Express REST API
  |-- MongoDB via Mongoose: users, complaints, comments
  |-- Ollama HTTP API: complaint classification
  |-- Private server/uploads directory: validated attachment bytes
  `-- Optional SMTP server: email notifications
```

The browser uses `VITE_API_URL` (default `http://localhost:5000/api`). The backend allows browser origins listed in `CLIENT_URL` and uses credentialed CORS for the auth cookie.

## User roles

- **Customer**: register/login, submit and edit own complaint text, upload/view own attachments, search and filter own tickets, comment, and track status.
- **Support Staff**: view complaints in their department, ordered by priority; filter, respond, and move tickets through the allowed workflow.
- **Admin**: view dashboard/analytics, list users, view departments, search complaints, assign same-department staff, and change complaint status. The current API provides user listing, not create/edit/delete user administration.

Demo admin and staff accounts are created explicitly with the scripts below. There are no hard-coded demo passwords. Customer accounts are created through Register.

## Database design

- **User**: name, unique email, bcrypt-hashed password (excluded from normal queries), role, optional staff department, timestamps.
- **Complaint**: unique public ticket ID (`CMP-...`), customer reference, subject/description, AI category/priority/department/confidence/reason, AI status, current status and history, assigned staff reference, private attachment metadata, notification deduplication keys, timestamps.
- **Comment**: complaint reference, author reference, message, creation time.

Attachment bytes are stored on disk in `server/uploads`; MongoDB stores the generated storage name and display metadata. The uploads directory is not served publicly.

## Folder structure

```text
Smart complaint/
|-- README.md
|-- package.json                 # workspace install helper
|-- client/
|   |-- .env.example
|   |-- index.html
|   |-- package.json
|   |-- vite.config.js
|   `-- src/
|       |-- main.jsx              # routes, auth/theme providers, customer/staff views
|       |-- styles.css
|       `-- components/
|           |-- AdminPages.jsx
|           `-- TicketDetails.jsx
`-- server/
    |-- .env.example
    |-- package.json
    |-- scripts/
    |   |-- createAdminDemo.js
    |   |-- createStaffDemo.js
    |   `-- emailCheck.js
    |-- src/
    |   |-- server.js
    |   |-- middleware/            # auth and upload validation
    |   |-- models/                # User, Complaint, Comment
    |   |-- routes/                # auth, complaints, comments, staff, admin
    |   `-- services/               # AI, email, attachment access/storage/headers, timeline
    |-- test/
    |   `-- attachments.test.js
    `-- uploads/                   # private runtime attachment storage; ignored by git
```

`node_modules`, generated `client/dist`, local `.env` files, and uploaded files are not source files and are omitted above.

## Main API endpoints

All paths below are under `/api`. Authentication uses the HTTP-only `authToken` cookie. Admin and staff endpoints enforce role and department authorization.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | API health |
| POST | `/auth/register` | Public | Create customer account |
| POST | `/auth/login` | Public | Sign in |
| POST | `/auth/logout` | Public | Clear auth cookie |
| GET | `/auth/me` | Signed in | Current safe user profile |
| POST | `/complaints` | Customer | Submit complaint and optional attachment |
| GET | `/complaints/my` | Customer | Search/filter own complaints (`search`, `status`, `category`, `priority`) |
| GET | `/complaints/:ticketId` | Owning customer | Ticket detail and status timeline |
| PUT | `/complaints/:ticketId` | Owning customer | Edit subject/description |
| GET | `/complaints/:ticketId/attachments/:attachmentId` | Owner, department staff, assigned staff, or admin | Open attachment; add `?download=1` to download |
| GET/POST | `/comments/:ticketId` | Owner or matching department staff | Read/add conversation message |
| GET | `/staff/complaints` | Support Staff | Department queue; accepts category/priority/status filters and sorts by priority |
| GET | `/staff/complaints/:ticketId` | Matching department staff | Staff ticket detail and next status |
| POST | `/staff/complaints/:ticketId/comments` | Matching department staff | Add staff response |
| PATCH | `/staff/complaints/:ticketId/status` | Matching department staff | Advance status through allowed workflow |
| GET | `/admin/dashboard` | Admin | Summary and analytics |
| GET | `/admin/complaints` | Admin | Search/filter complaints |
| GET | `/admin/users` | Admin | List/filter users by role |
| GET | `/admin/departments` | Admin | Department staff and complaint counts |
| PATCH | `/admin/complaints/:ticketId/assignment` | Admin | Assign staff in matching department or queue complaint |
| PATCH | `/admin/complaints/:ticketId/status` | Admin | Update complaint status |

## Installation

Prerequisites: Node.js (LTS), npm, MongoDB, and (for live AI analysis) Ollama.

From the project root:

```powershell
npm run install:all
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Edit `server/.env`. Set `MONGODB_URI` and a strong random `JWT_SECRET` at minimum. To generate a secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start MongoDB. For local AI, install/start Ollama and download the configured model:

```powershell
ollama pull llama3.2:3b
```

AI analysis falls back safely when Ollama is unavailable, but live classification requires a reachable Ollama server and installed model.

## Environment variables

See `server/.env.example` for the full template. Required backend settings:

- `MONGODB_URI`: MongoDB connection string.
- `JWT_SECRET`: private signing secret; do not commit or share it.

Common optional settings:

- `PORT`: API port (default `5000`).
- `CLIENT_URL`: comma-separated allowed frontend origins (defaults to ports 5173 and 5174).
- `OLLAMA_BASE_URL`: Ollama base URL (default `http://127.0.0.1:11434`).
- `OLLAMA_MODEL`: installed Ollama model (default `llama3.2:3b`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`: optional mail transport settings. Port 465 enables implicit TLS; 587 uses STARTTLS.
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: consumed by the admin creation script.
- `STAFF_NAME`, `STAFF_EMAIL`, `STAFF_PASSWORD`, `STAFF_DEPARTMENT`: consumed by the staff creation script. Department must exactly match a department listed above.
- `VITE_API_URL` in `client/.env`: optional API base URL for the browser; it is not a secret.

Never put SMTP credentials, database credentials, JWT secrets, or AI provider keys in frontend `VITE_` variables. The current Ollama integration does not require an API key.

## Running the project

Open two terminals at the project root.

Backend:

```powershell
cd server
npm run dev
```

Frontend:

```powershell
cd client
npm run dev
```

Open the frontend URL printed by Vite (normally `http://localhost:5173`). Check `http://localhost:5000/api/health` for backend health. For production-mode backend use `npm start` from `server`.

## Demo accounts

- **Customer**: use the Register page; the first registered user is a Customer.
- **Support Staff**: set `STAFF_NAME`, `STAFF_EMAIL`, `STAFF_PASSWORD`, and `STAFF_DEPARTMENT` in `server/.env`, then run `npm run staff:create-demo` from `server`.
- **Admin**: set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `server/.env`, then run `npm run admin:create-demo` from `server`.

Sign in using the email and password you configured. The project does not include a shared/default password. Demo creation refuses duplicate emails and hashes the password using the User model.

## Testing

Backend unit tests (attachment storage, signature validation, access control, ID lookup, response headers):

```powershell
cd server
npm test
```

Frontend production compilation:

```powershell
cd client
npm run build
```

Live AI examples (10 complaint scenarios) and full customer/staff/admin API smoke checks were also run during final-phase verification. These live checks require reachable MongoDB, API, and Ollama services. To verify optional SMTP without sending mail, run `npm run email:verify` in `server` during development. To send a test message, run `npm run email:test -- recipient@example.com`; SMTP acceptance is not a guarantee of inbox delivery. Both diagnostic commands refuse to run when `NODE_ENV=production`.

## Known limitations

- AI classification can be incorrect; fallback values are used when the local model fails. Staff review is important.
- Ollama and model installation are separate local prerequisites for real AI results.
- SMTP is optional and network/provider dependent; messages can be rejected or delayed after server acceptance.
- Attachments use local disk, so multi-instance hosting needs shared/private object storage.
- The admin user screen lists accounts; account provisioning uses scripts and does not currently include role editing/deletion APIs.
- The profile page displays authenticated account details but does not currently edit them.
- The automated backend suite is focused on attachment behavior. Full API and AI scenario checks were run as live smoke tests, not committed as an automated integration suite. Browser-level visual automation is not configured.
- The API has no built-in rate limiter or password reset flow.

## Future enhancements

- Add repeatable automated API integration tests and browser tests for core customer/staff/admin flows.
- Add rate limiting, password reset, email verification, and audited admin user management.
- Move attachments to a private object store for production deployments.
- Add AI evaluation datasets and staff feedback to measure routing quality.
- Add notification delivery status/retry monitoring and a durable background job queue.
