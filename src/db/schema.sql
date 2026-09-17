-- QR-Based Asset Management System schema
-- Based on the supplied ERD. Table/column names intentionally follow the ERD.

CREATE TABLE IF NOT EXISTS roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT
);

CREATE TABLE IF NOT EXISTS permissions (
  perm_id SERIAL PRIMARY KEY,
  module VARCHAR(100) NOT NULL,
  action SMALLINT NOT NULL CHECK (action BETWEEN 1 AND 4),
  description VARCHAR(255),
  CONSTRAINT permissions_module_action_key UNIQUE (module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_permission_id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  perm_id INT NOT NULL REFERENCES permissions(perm_id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_unique UNIQUE (role_id, perm_id)
);

CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INT NOT NULL REFERENCES roles(role_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT,
  updated_by INT
);

CREATE TABLE IF NOT EXISTS user_details (
  user_details_id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  extension VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  category_id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INT
);

CREATE TABLE IF NOT EXISTS locations (
  location_id SERIAL PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INT
);

CREATE TABLE IF NOT EXISTS asset_qr (
  qr_id SERIAL PRIMARY KEY,
  qr_code_url VARCHAR(500) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_printed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS assets (
  asset_id SERIAL PRIMARY KEY,
  asset_name VARCHAR(255) NOT NULL,
  qr_id INT UNIQUE NOT NULL REFERENCES asset_qr(qr_id),
  category_id INT NOT NULL REFERENCES categories(category_id),
  serial_no VARCHAR(100),
  brand VARCHAR(100),
  model VARCHAR(100),
  purchase_date DATE,
  status SMALLINT NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INT
);



CREATE TABLE IF NOT EXISTS asset_transfer (
  asset_transfer_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id),
  asset_id INT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  from_location_id INT REFERENCES locations(location_id),
  to_location_id INT NOT NULL REFERENCES locations(location_id),
  reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INT
);

CREATE TABLE IF NOT EXISTS maintenance (
  maintenance_id SERIAL PRIMARY KEY,
  asset_id INT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  condition SMALLINT NOT NULL DEFAULT 0 CHECK (condition BETWEEN 0 AND 2),
  repair_status SMALLINT NOT NULL DEFAULT 0 CHECK (repair_status BETWEEN 0 AND 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id INT NOT NULL,
  action SMALLINT NOT NULL CHECK (action BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_custody (
  asset_custody_id SERIAL PRIMARY KEY,
  asset_id INT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  custodian_user_id INT NOT NULL REFERENCES users(user_id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMPTZ NULL,
  assigned_by INT REFERENCES users(user_id),
  remarks VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_active_custody
ON asset_custody(asset_id)
WHERE returned_at IS NULL;

CREATE TABLE IF NOT EXISTS asset_photos (
  asset_photo_id SERIAL PRIMARY KEY,
  asset_id INT NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_key TEXT,
  caption VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by INT REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_primary_photo
ON asset_photos(asset_id)
WHERE is_primary IS TRUE;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_asset_transfer_asset_created ON asset_transfer(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_transfer_location ON asset_transfer(to_location_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_asset_created ON maintenance(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON audit_logs(table_name, record_id);


