# AMS Backend — ERD-aligned API

Node.js + Express + PostgreSQL + JWT backend for the QR-Based Asset Management System.

## 1. Install

```bash
npm install
cp .env.example .env
```

Edit `.env` with your PostgreSQL `DATABASE_URL` and a strong `JWT_SECRET`.

## 2. Create / migrate the database

Use a fresh PostgreSQL database where possible:

```bash
npm run migrate
```

If this database still contains the **old prototype schema** (`rooms`, `transfers`, old `assets`, old `users`), and you intentionally want to erase those AMS tables, set:

```env
CONFIRM_DB_RESET=YES
```

then run:

```bash
npm run db:reset
npm run migrate
```

`db:reset` is destructive and refuses to run unless the confirmation variable is exactly `YES`.

## 3. Create the first Admin

Set these in `.env`:

```env
SEED_ADMIN_EMAIL=admin@example.edu
SEED_ADMIN_PASSWORD=your-strong-password
SEED_ADMIN_FIRST_NAME=System
SEED_ADMIN_LAST_NAME=Admin
```

Then:

```bash
npm run seed:admin
```

No default passwords are hard-coded in the repository.

## 4. Run

```bash
npm run dev
```

API: `http://localhost:3000`

Health check:

```text
GET /health
```

## API groups

- `/api/auth` — login, current user, optional signup
- `/api/users` — users + user details
- `/api/rbac` — roles and permissions
- `/api/assets` — asset CRUD and QR lookup
- `/api/asset-qr` — QR metadata (`is_active`, `is_printed`)
- `/api/categories` — categories
- `/api/locations` — locations
- `/api/rooms` — temporary alias to locations
- `/api/transfers` — asset transfer history
- `/api/maintenance` — asset condition / repair history
- `/api/audit-logs` — persistent audit history
- `/api/dashboard` — summary counts and recent transfers

See `API_CONTRACT.md` and `ERD_IMPLEMENTATION_NOTES.md`.
