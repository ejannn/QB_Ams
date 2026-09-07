const AUDIT_ACTION = {
  CREATE: 1,
  READ: 2,
  UPDATE: 3,
  DELETE: 4,
};

async function writeAudit(db, userId, tableName, recordId, action) {
  await db.query(
    `INSERT INTO audit_logs (user_id, table_name, record_id, action)
     VALUES ($1, $2, $3, $4)`,
    [userId || null, tableName, recordId, action]
  );
}

module.exports = { AUDIT_ACTION, writeAudit };
