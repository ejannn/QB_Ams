const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { ACTION_NAMES } = require('../db/rbac');

const router = express.Router();

router.get('/', requireAuth, requirePermission('Audit Logs', 2), async (req, res) => {
  try {
    const conditions = [];
    const values = [];
    let i = 1;
    if (req.query.tableName) {
      conditions.push(`LOWER(l.table_name) = LOWER($${i++})`);
      values.push(req.query.tableName);
    }
    if (req.query.userId) {
      conditions.push(`l.user_id = $${i++}`);
      values.push(Number(req.query.userId));
    }
    if (req.query.recordId) {
      conditions.push(`l.record_id = $${i++}`);
      values.push(Number(req.query.recordId));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    values.push(limit);

    const { rows } = await pool.query(
      `SELECT l.log_id AS "logId", l.user_id AS "userId", l.table_name AS "tableName",
              l.record_id AS "recordId", l.action, l.created_at AS "createdAt",
              CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name, d.extension) AS "userName"
       FROM audit_logs l
       LEFT JOIN user_details d ON d.user_id = l.user_id
       ${where}
       ORDER BY l.created_at DESC, l.log_id DESC
       LIMIT $${i}`,
      values
    );

    res.json(rows.map((row) => ({ ...row, actionLabel: ACTION_NAMES[row.action] || 'unknown' })));
  } catch (err) {
    console.error('Fetch audit logs error:', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
});

module.exports = router;
