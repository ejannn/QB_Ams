const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { writeAudit, AUDIT_ACTION } = require('../utils/audit');

const router = express.Router();

router.get('/', requireAuth, requirePermission('Transfers', 2), async (req, res) => {
  try {
    const values = [];
    let where = '';
    if (req.query.assetId) {
      values.push(Number(req.query.assetId));
      where = 'WHERE t.asset_id = $1';
    }

    const { rows } = await pool.query(
      `SELECT t.asset_transfer_id AS "assetTransferId",
              t.user_id AS "userId",
              t.asset_id AS "assetId",
              a.asset_name AS "assetName",
              q.qr_code_url AS "qrCodeUrl",
              t.from_location_id AS "fromLocationId",
              fl.name AS "fromLocationName",
              t.to_location_id AS "toLocationId",
              tl.name AS "toLocationName",
              t.reason,
              t.created_at AS "createdAt",
              CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name, d.extension) AS "handledBy"
       FROM asset_transfer t
       JOIN assets a ON a.asset_id = t.asset_id
       JOIN asset_qr q ON q.qr_id = a.qr_id
       LEFT JOIN locations fl ON fl.location_id = t.from_location_id
       JOIN locations tl ON tl.location_id = t.to_location_id
       LEFT JOIN user_details d ON d.user_id = t.user_id
       ${where}
       ORDER BY t.created_at DESC, t.asset_transfer_id DESC`,
      values
    );
    res.json(rows);
  } catch (err) {
    console.error('Fetch transfers error:', err);
    res.status(500).json({ error: 'Failed to retrieve transfers.' });
  }
});

router.post('/', requireAuth, requirePermission('Transfers', 1), async (req, res) => {
  const client = await pool.connect();
  try {
    const { assetId, toLocationId, reason = '' } = req.body;
    if (!assetId || !toLocationId) return res.status(400).json({ error: 'assetId and toLocationId are required.' });

    await client.query('BEGIN');
    const asset = await client.query('SELECT asset_id FROM assets WHERE asset_id = $1 AND status = 1', [assetId]);
    if (!asset.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active asset not found.' });
    }
    const location = await client.query('SELECT location_id FROM locations WHERE location_id = $1', [toLocationId]);
    if (!location.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'toLocationId does not exist.' });
    }

    const previous = await client.query(
      `SELECT to_location_id FROM asset_transfer
       WHERE asset_id = $1
       ORDER BY created_at DESC, asset_transfer_id DESC LIMIT 1`,
      [assetId]
    );
    const fromLocationId = previous.rows[0]?.to_location_id || null;
    if (fromLocationId && Number(fromLocationId) === Number(toLocationId)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Asset is already in that location.' });
    }

    const { rows } = await client.query(
      `INSERT INTO asset_transfer
       (user_id, asset_id, from_location_id, to_location_id, reason, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $1, $1)
       RETURNING asset_transfer_id AS "assetTransferId", user_id AS "userId", asset_id AS "assetId",
                 from_location_id AS "fromLocationId", to_location_id AS "toLocationId", reason, created_at AS "createdAt"`,
      [req.user.userId, assetId, fromLocationId, toLocationId, reason]
    );

    await writeAudit(client, req.user.userId, 'asset_transfer', rows[0].assetTransferId, AUDIT_ACTION.CREATE);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('Create transfer error:', err);
    res.status(500).json({ error: 'Failed to transfer asset.' });
  } finally {
    client.release();
  }
});

module.exports = router;
