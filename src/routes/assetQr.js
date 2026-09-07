const express = require('express');
const { randomUUID } = require('crypto');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { writeAudit, AUDIT_ACTION } = require('../utils/audit');

const router = express.Router();

router.get('/', requireAuth, requirePermission('Asset QR', 2), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT qr_id AS "qrId", qr_code_url AS "qrCodeUrl", is_active AS "isActive",
              is_printed AS "isPrinted", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM asset_qr ORDER BY qr_id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Fetch QR error:', err);
    res.status(500).json({ error: 'Failed to retrieve QR records.' });
  }
});

router.post('/', requireAuth, requirePermission('Asset QR', 1), async (req, res) => {
  try {
    const qrCodeUrl = String(req.body.qrCodeUrl || `ams://asset/${randomUUID()}`).trim();
    const { rows } = await pool.query(
      `INSERT INTO asset_qr (qr_code_url, created_by, updated_by)
       VALUES ($1, $2, $2)
       RETURNING qr_id AS "qrId", qr_code_url AS "qrCodeUrl", is_active AS "isActive", is_printed AS "isPrinted"`,
      [qrCodeUrl, req.user.userId]
    );
    await writeAudit(pool, req.user.userId, 'asset_qr', rows[0].qrId, AUDIT_ACTION.CREATE);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'QR code already exists.' });
    console.error('Create QR error:', err);
    res.status(500).json({ error: 'Failed to create QR record.' });
  }
});

router.patch('/:id', requireAuth, requirePermission('Asset QR', 3), async (req, res) => {
  try {
    const fields = [];
    const values = [];
    let i = 1;
    const push = (column, value) => {
      if (value !== undefined) {
        fields.push(`${column} = $${i++}`);
        values.push(value);
      }
    };
    push('qr_code_url', req.body.qrCodeUrl);
    push('is_active', req.body.isActive);
    push('is_printed', req.body.isPrinted);
    if (!fields.length) return res.status(400).json({ error: 'No QR fields provided.' });
    fields.push(`updated_at = NOW()`);
    fields.push(`updated_by = $${i++}`);
    values.push(req.user.userId);
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE asset_qr SET ${fields.join(', ')} WHERE qr_id = $${i}
       RETURNING qr_id AS "qrId", qr_code_url AS "qrCodeUrl", is_active AS "isActive", is_printed AS "isPrinted", updated_at AS "updatedAt"`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'QR record not found.' });
    await writeAudit(pool, req.user.userId, 'asset_qr', Number(req.params.id), AUDIT_ACTION.UPDATE);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'QR code already exists.' });
    console.error('Update QR error:', err);
    res.status(500).json({ error: 'Failed to update QR record.' });
  }
});

module.exports = router;
