const pool = require('./pool');

async function reset() {
  if (process.env.CONFIRM_DB_RESET !== 'YES') {
    console.error('Database reset refused. Set CONFIRM_DB_RESET=YES only when you intentionally want to delete AMS tables.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const sql = `
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS maintenance CASCADE;
    DROP TABLE IF EXISTS asset_transfer CASCADE;
    DROP TABLE IF EXISTS assets CASCADE;
    DROP TABLE IF EXISTS asset_qr CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS locations CASCADE;
    DROP TABLE IF EXISTS user_details CASCADE;
    DROP TABLE IF EXISTS role_permissions CASCADE;
    DROP TABLE IF EXISTS permissions CASCADE;
    DROP TABLE IF EXISTS user_roles CASCADE;
    DROP TABLE IF EXISTS transfers CASCADE;
    DROP TABLE IF EXISTS rooms CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS roles CASCADE;
  `;

  try {
    await pool.query(sql);
    console.log('AMS tables removed. Run `npm run migrate` next.');
  } catch (err) {
    console.error('Reset failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

reset();
