const fs = require('fs');
const path = require('path');

const pool = require('./pool');

const MIGRATIONS_DIR =
  path.join(
    __dirname,
    'migrations'
  );


async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(255)
        PRIMARY KEY,

      applied_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW()
    )
  `);
}


async function getAppliedMigrations(client) {
  const result =
    await client.query(`
      SELECT
        migration_name
      FROM schema_migrations
    `);

  return new Set(
    result.rows.map(
      row => row.migration_name
    )
  );
}


async function runMigration(
  client,
  fileName
) {
  const filePath =
    path.join(
      MIGRATIONS_DIR,
      fileName
    );

  const sql =
    fs.readFileSync(
      filePath,
      'utf8'
    );

  console.log(
    `Applying ${fileName}...`
  );

  await client.query('BEGIN');

  try {
    await client.query(sql);

    await client.query(
      `
      INSERT INTO schema_migrations (
        migration_name
      )
      VALUES ($1)
      `,
      [fileName]
    );

    await client.query('COMMIT');

    console.log(
      `✓ ${fileName}`
    );

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}


async function migrate() {
  const client =
    await pool.connect();

  try {
    await ensureMigrationTable(
      client
    );

    const applied =
      await getAppliedMigrations(
        client
      );

    const files =
      fs.readdirSync(
        MIGRATIONS_DIR
      )
        .filter(
          file =>
            file.endsWith('.sql')
        )
        .sort();

    let appliedCount = 0;

    for (const fileName of files) {
      if (
        applied.has(fileName)
      ) {
        console.log(
          `Skipping ${fileName}`
        );

        continue;
      }

      await runMigration(
        client,
        fileName
      );

      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log(
        'Database is already up to date.'
      );
    } else {
      console.log(
        `Applied ${appliedCount} migration(s).`
      );
    }

  } finally {
    client.release();
    await pool.end();
  }
}


migrate()
  .then(() => {
    console.log(
      'Migration complete.'
    );
  })
  .catch(err => {
    console.error(
      'Migration failed:',
      err
    );

    process.exitCode = 1;
  });