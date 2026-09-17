-- =====================================================
-- User activation / deactivation
-- =====================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;


CREATE INDEX IF NOT EXISTS idx_users_is_active
ON users(is_active);


-- =====================================================
-- Reports permission
-- =====================================================

INSERT INTO permissions (
  module,
  action,
  description
)
VALUES (
  'Reports',
  2,
  'Read reports'
)
ON CONFLICT (module, action)
DO UPDATE SET
  description = EXCLUDED.description;


-- Admin should explicitly contain the permission
-- even though Admin currently bypasses RBAC checks.

INSERT INTO role_permissions (
  role_id,
  perm_id
)
SELECT
  r.role_id,
  p.perm_id
FROM roles r
JOIN permissions p
  ON p.module = 'Reports'
  AND p.action = 2
WHERE LOWER(r.role_name) = 'admin'
ON CONFLICT (role_id, perm_id)
DO NOTHING;


-- Audit role is specifically intended for
-- read-only auditing and reporting.

INSERT INTO role_permissions (
  role_id,
  perm_id
)
SELECT
  r.role_id,
  p.perm_id
FROM roles r
JOIN permissions p
  ON p.module = 'Reports'
  AND p.action = 2
WHERE LOWER(r.role_name) = 'audit'
ON CONFLICT (role_id, perm_id)
DO NOTHING;