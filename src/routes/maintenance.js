const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { writeAudit, AUDIT_ACTION } = require('../utils/audit');
const { CONDITION, REPAIR_STATUS } = require('../utils/labels');

const router = express.Router();

function serialize(row) {
  return {
    ...row,
    conditionLabel: CONDITION[row.condition] ?? 'Unknown',
    repairStatusLabel: REPAIR_STATUS[row.repairStatus] ?? 'Unknown',
  };
}

function valid0to2(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 2;
}

router.get('/', requireAuth, requirePermission('Maintenance', 2), async (req, res) => {
  try {
    const values = [];
    let where = '';
    if (req.query.assetId) {
      values.push(Number(req.query.assetId));
      where = 'WHERE m.asset_id = $1';
    }
    const { rows } = await pool.query(
      `SELECT m.maintenance_id AS "maintenanceId", m.asset_id AS "assetId", a.asset_name AS "assetName",
              m.condition, m.repair_status AS "repairStatus",
              m.created_at AS "createdAt", m.updated_at AS "updatedAt"
       FROM maintenance m
       JOIN assets a ON a.asset_id = m.asset_id
       ${where}
       ORDER BY m.created_at DESC, m.maintenance_id DESC`,
      values
    );
    res.json(rows.map(serialize));
  } catch (err) {
    console.error('Fetch maintenance error:', err);
    res.status(500).json({ error: 'Failed to retrieve maintenance records.' });
  }
});

router.post('/', requireAuth, requirePermission('Maintenance', 1), async (req, res) => {
  try {
    const { assetId, condition, repairStatus = 0 } = req.body;
    if (!assetId || !valid0to2(condition) || !valid0to2(repairStatus)) {
      return res.status(400).json({ error: 'assetId is required; condition and repairStatus must be integers from 0 to 2.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO maintenance (asset_id, condition, repair_status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING maintenance_id AS "maintenanceId", asset_id AS "assetId", condition,
                 repair_status AS "repairStatus", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [assetId, Number(condition), Number(repairStatus), req.user.userId]
    );
    await writeAudit(pool, req.user.userId, 'maintenance', rows[0].maintenanceId, AUDIT_ACTION.CREATE);
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'assetId does not exist.' });
    console.error('Create maintenance error:', err);
    res.status(500).json({ error: 'Failed to create maintenance record.' });
  }
});

router.patch('/:id', requireAuth, requirePermission('Maintenance', 3), async (req, res) => {
  try {
    const fields = [];
    const values = [];
    let i = 1;
    if (req.body.condition !== undefined) {
      if (!valid0to2(req.body.condition)) return res.status(400).json({ error: 'condition must be 0, 1, or 2.' });
      fields.push(`condition = $${i++}`);
      values.push(Number(req.body.condition));
    }
    if (req.body.repairStatus !== undefined) {
      if (!valid0to2(req.body.repairStatus)) return res.status(400).json({ error: 'repairStatus must be 0, 1, or 2.' });
      fields.push(`repair_status = $${i++}`);
      values.push(Number(req.body.repairStatus));
    }
    if (!fields.length) return res.status(400).json({ error: 'No maintenance fields provided.' });
    fields.push('updated_at = NOW()');
    fields.push(`updated_by = $${i++}`);
    values.push(req.user.userId);
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE maintenance SET ${fields.join(', ')} WHERE maintenance_id = $${i}
       RETURNING maintenance_id AS "maintenanceId", asset_id AS "assetId", condition,
                 repair_status AS "repairStatus", created_at AS "createdAt", updated_at AS "updatedAt"`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Maintenance record not found.' });
    await writeAudit(pool, req.user.userId, 'maintenance', Number(req.params.id), AUDIT_ACTION.UPDATE);
    res.json(serialize(rows[0]));
  } catch (err) {
    console.error('Update maintenance error:', err);
    res.status(500).json({ error: 'Failed to update maintenance record.' });
  }
});

module.exports = router;
