-- Reference data taken from the ERD examples plus permissions needed by the API.

INSERT INTO roles (role_name, description) VALUES
  ('Admin', 'Full system administration access'),
  ('Custodian', 'Manages assets, transfers, locations, and maintenance'),
  ('Audit', 'Read-only auditing and reporting access')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO categories (name) VALUES
  ('Electronics'),
  ('Furniture'),
  ('Consumable')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (module, action, description) VALUES
  ('Assets', 1, 'Create assets'),
  ('Assets', 2, 'Read assets'),
  ('Assets', 3, 'Update assets'),
  ('Assets', 4, 'Deactivate assets'),
  ('Asset QR', 1, 'Create QR records'),
  ('Asset QR', 2, 'Read QR records'),
  ('Asset QR', 3, 'Update QR records'),
  ('Asset QR', 4, 'Delete QR records'),
  ('Categories', 1, 'Create categories'),
  ('Categories', 2, 'Read categories'),
  ('Categories', 3, 'Update categories'),
  ('Categories', 4, 'Delete categories'),
  ('Locations', 1, 'Create locations'),
  ('Locations', 2, 'Read locations'),
  ('Locations', 3, 'Update locations'),
  ('Locations', 4, 'Delete locations'),
  ('Transfers', 1, 'Create asset transfers'),
  ('Transfers', 2, 'Read asset transfers'),
  ('Transfers', 3, 'Update asset transfers'),
  ('Transfers', 4, 'Delete asset transfers'),
  ('Maintenance', 1, 'Create maintenance records'),
  ('Maintenance', 2, 'Read maintenance records'),
  ('Maintenance', 3, 'Update maintenance records'),
  ('Maintenance', 4, 'Delete maintenance records'),
  ('Users', 1, 'Create users'),
  ('Users', 2, 'Read users'),
  ('Users', 3, 'Update users'),
  ('Users', 4, 'Delete users'),
  ('Roles', 1, 'Create roles'),
  ('Roles', 2, 'Read roles and permissions'),
  ('Roles', 3, 'Update roles and permissions'),
  ('Roles', 4, 'Delete roles'),
  ('Audit Logs', 2, 'Read audit logs'),
  ('Dashboard', 2, 'Read dashboard statistics')
ON CONFLICT (module, action) DO NOTHING;

-- Admin receives every permission.
INSERT INTO role_permissions (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'Admin'
ON CONFLICT (role_id, perm_id) DO NOTHING;

-- Custodian permissions.
INSERT INTO role_permissions (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM roles r
JOIN permissions p ON (
  (p.module = 'Assets' AND p.action IN (1,2,3)) OR
  (p.module = 'Asset QR' AND p.action IN (1,2,3)) OR
  (p.module = 'Categories' AND p.action = 2) OR
  (p.module = 'Locations' AND p.action IN (1,2,3)) OR
  (p.module = 'Transfers' AND p.action IN (1,2)) OR
  (p.module = 'Maintenance' AND p.action IN (1,2,3)) OR
  (p.module = 'Dashboard' AND p.action = 2)
)
WHERE r.role_name = 'Custodian'
ON CONFLICT (role_id, perm_id) DO NOTHING;

-- Audit role is read-only.
INSERT INTO role_permissions (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM roles r
JOIN permissions p ON p.action = 2
WHERE r.role_name = 'Audit'
ON CONFLICT (role_id, perm_id) DO NOTHING;
