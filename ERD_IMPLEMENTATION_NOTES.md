# ERD implementation notes

The database model follows the supplied AMS ERD: `Assets`, `Categories`, `Locations`, `Asset_QR`, `Asset_Transfer`, `Maintenance`, `Users`, `User_Details`, `Roles`, `Permissions`, `Role_Permissions`, and `Audit_Logs`.

## Intentional implementation choices

Two ERD data types were adjusted for the running PostgreSQL/API implementation:

1. `created_at` / `updated_at` fields are `TIMESTAMPTZ` rather than `int`, because the application consumes actual dates/times.
2. `Assets.serial_no` is `VARCHAR(100)` rather than `int`, because the existing React frontend uses alphanumeric serial numbers such as `DLLOP7090-001`.

The ERD does **not** define a user approval/suspension field. Therefore this backend does not silently add one. Public signup is disabled by default (`ALLOW_SIGNUP=false`) and administrators can create users through `POST /api/users`.

The ERD calls rooms `Locations`. `/api/locations` is canonical. `/api/rooms` is kept only as a temporary compatibility alias while the React frontend is migrated.

## Numeric values from the ERD

- Asset status: `0 = Inactive`, `1 = Active`
- Maintenance condition: `0 = New`, `1 = Good`, `2 = Damaged`
- Repair status: `0 = No Repair`, `1 = In Repair`, `2 = Discard`
- Permission/audit action: `1 = Create`, `2 = Read`, `3 = Update`, `4 = Delete`
