const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const reference = fs.readFileSync(path.join(__dirname, 'reference.sql'), 'utf8');

    await client.query('BEGIN');
    await client.query(schema);
    await client.query(reference);
    await client.query('COMMIT');
    console.log('AMS ERD migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
