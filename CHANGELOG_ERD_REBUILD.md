# ERD Backend Rebuild Summary

## Database

Replaced the prototype schema with the supplied ERD entities:

- roles
- permissions
- role_permissions
- users
- user_details
- categories
- locations
- asset_qr
- assets
- asset_transfer
- maintenance
- audit_logs

## API

Added/rewrote:

- JWT login and `/auth/me`
- ERD role/permission authorization using module + action codes
- Assets CRUD with soft-deactivation
- QR metadata and scan lookup
- Categories CRUD
- Locations CRUD
- Asset transfers using foreign keys
- Maintenance history
- Persistent audit logs
- User + user details management
- Roles + permissions management
- Dashboard counts using current maintenance/transfer state

## Security / configuration

- Removed hard-coded seeded passwords.
- Real `.env` is intentionally not included in this package.
- Added environment-driven admin seeding.
- Added explicit destructive-reset confirmation.
- CORS origin is configurable.
- Login rate limiting remains enabled.

## Verification performed

`npm run check` passes for all JavaScript entry points/routes.

A live PostgreSQL integration test was not run in the build environment because no PostgreSQL server is available there. Run `npm run migrate`, `npm run seed:admin`, then `npm run dev` against your PostgreSQL instance.
