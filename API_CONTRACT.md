# API Contract — AMS Backend v2

Base URL: `http://localhost:3000`

Protected routes require:

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

## Auth

### `POST /api/auth/login`

```json
{
  "email": "admin@example.edu",
  "password": "your-password"
}
```

Returns JWT + user + permission keys.

### `GET /api/auth/me`
Returns the authenticated user's details, role, and permissions.

### `POST /api/auth/signup`
Disabled unless `ALLOW_SIGNUP=true`.

## Assets

### `GET /api/assets`
Optional query parameters: `status`, `categoryId`, `locationId`, `q`.

### `GET /api/assets/:id`
Get one asset.

### `GET /api/assets/scan?code=<qr payload>`
Find an asset by `Asset_QR.qr_code_url`.

### `POST /api/assets`

```json
{
  "assetName": "Dell OptiPlex Desktop",
  "categoryId": 1,
  "serialNo": "DLLOP7090-001",
  "brand": "Dell",
  "model": "OptiPlex 7090",
  "status": 1,
  "locationId": 1,
  "condition": 1,
  "repairStatus": 0
}
```

`qrCodeUrl` is optional; a unique `ams://asset/...` payload is generated when omitted.

### `PATCH /api/assets/:id`
Update `assetName`, `categoryId`, `serialNo`, `brand`, `model`, `status`, or `qrCodeUrl`.

### `DELETE /api/assets/:id`
Soft-delete: sets ERD asset status to `0` (Inactive).

## Transfers

### `GET /api/transfers?assetId=1`

### `POST /api/transfers`

```json
{
  "assetId": 1,
  "toLocationId": 2,
  "reason": "Moved to Room 202"
}
```

The API calculates `from_location_id` from the asset's latest transfer.

## Maintenance

### `GET /api/maintenance?assetId=1`

### `POST /api/maintenance`

```json
{
  "assetId": 1,
  "condition": 2,
  "repairStatus": 1
}
```

### `PATCH /api/maintenance/:id`
Update `condition` and/or `repairStatus`.

## Categories

- `GET /api/categories`
- `POST /api/categories` body `{ "name": "Electronics" }`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id`

## Locations

- `GET /api/locations`
- `POST /api/locations` body `{ "name": "Room 201" }`
- `PATCH /api/locations/:id`
- `DELETE /api/locations/:id`

`/api/rooms` temporarily points to the same routes for old frontend compatibility.

## Asset QR

- `GET /api/asset-qr`
- `POST /api/asset-qr`
- `PATCH /api/asset-qr/:id` with `qrCodeUrl`, `isActive`, and/or `isPrinted`

## Users

- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PATCH /api/users/:id`

Example create body:

```json
{
  "email": "custodian@example.edu",
  "password": "strong-password",
  "roleId": 2,
  "firstName": "John",
  "middleName": "Dela",
  "lastName": "Cruz",
  "extension": null
}
```

## RBAC

- `GET /api/rbac/roles`
- `GET /api/rbac/permissions`
- `POST /api/rbac/roles`
- `PUT /api/rbac/roles/:id/permissions` body `{ "permIds": [1,2,3] }`

Permission actions follow the ERD: `1 Create`, `2 Read`, `3 Update`, `4 Delete`.

## Audit logs

### `GET /api/audit-logs`
Optional: `tableName`, `userId`, `recordId`, `limit`.

## Dashboard

### `GET /api/dashboard`
Returns total/active/inactive assets, damaged/in-repair counts, category totals, and recent transfers.
