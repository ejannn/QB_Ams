const bcrypt = require('bcrypt');
const pool = require('./pool');

const SALT_ROUNDS = 10;

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const firstName = process.env.SEED_ADMIN_FIRST_NAME || 'System';
  const middleName = process.env.SEED_ADMIN_MIDDLE_NAME || null;
  const lastName = process.env.SEED_ADMIN_LAST_NAME || 'Admin';
  const extension = process.env.SEED_ADMIN_EXTENSION || null;

  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  if (password.length < 8) {
    console.error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const roleResult = await client.query("SELECT role_id FROM roles WHERE role_name = 'Admin'");
    if (roleResult.rows.length === 0) {
      throw new Error('Admin role does not exist. Run `npm run migrate` first.');
    }

    const roleId = roleResult.rows[0].role_id;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role_id = EXCLUDED.role_id,
           updated_at = NOW()
       RETURNING user_id, email`,
      [email.toLowerCase(), passwordHash, roleId]
    );

    const userId = userResult.rows[0].user_id;
    await client.query(
      `INSERT INTO user_details (user_id, first_name, middle_name, last_name, extension)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           middle_name = EXCLUDED.middle_name,
           last_name = EXCLUDED.last_name,
           extension = EXCLUDED.extension,
           updated_at = NOW()`,
      [userId, firstName, middleName, lastName, extension]
    );

    await client.query('COMMIT');
    console.log(`Admin account ready: ${email}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdmin();
