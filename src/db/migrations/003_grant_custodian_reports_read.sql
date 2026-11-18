-- QRBAMS: Allow Custodians to VIEW reports.
-- CSV export remains Admin-only in src/routes/reports.js.
-- This migration adds only the Reports/Read role permission.
-- Executed inside a transaction by src/db/migrate.js.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM roles
    WHERE LOWER(TRIM(role_name)) = 'custodian'
  ) THEN
    RAISE EXCEPTION 'Custodian role not found. No permissions changed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM permissions
    WHERE LOWER(TRIM(module)) = 'reports' AND action = 2
  ) THEN
    RAISE EXCEPTION 'Reports Read permission not found. No permissions changed.';
  END IF;
END
$$;

INSERT INTO role_permissions (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM roles AS r
CROSS JOIN permissions AS p
WHERE LOWER(TRIM(r.role_name)) = 'custodian'
  AND LOWER(TRIM(p.module)) = 'reports'
  AND p.action = 2
ON CONFLICT (role_id, perm_id) DO NOTHING;
