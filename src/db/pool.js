// Central Postgres connection pool.
// Using a Pool (not a single Client) means the app can handle many
// simultaneous requests without opening a new connection every time.
// Every other file in the app should import THIS file to talk to the DB.

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Catches unexpected errors on idle clients so the whole app doesn't crash
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = pool;
