const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { writeAudit, AUDIT_ACTION } = require('../utils/audit');

const router = express.Router();

router.get('/', requireAuth, requirePermission('Locations', 2), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT location_id AS "locationId", name, created_at AS "createdAt", updated_at AS "updatedAt" FROM locations ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Fetch locations error:', err);
    res.status(500).json({ error: 'Failed to retrieve locations.' });
  }
});

router.post('/', requireAuth, requirePermission('Locations', 1), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Location name is required.' });
    const { rows } = await pool.query(
      `INSERT INTO locations (name, created_by, updated_by)
       VALUES ($1, $2, $2)
       RETURNING location_id AS "locationId", name, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, req.user.userId]
    );
    await writeAudit(pool, req.user.userId, 'locations', rows[0].locationId, AUDIT_ACTION.CREATE);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Location already exists.' });
    console.error('Create location error:', err);
    res.status(500).json({ error: 'Failed to create location.' });
  }
});

router.patch('/:id', requireAuth, requirePermission('Locations', 3), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Location name is required.' });
    const { rows } = await pool.query(
      `UPDATE locations SET name = $1, updated_at = NOW(), updated_by = $2
       WHERE location_id = $3
       RETURNING location_id AS "locationId", name, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, req.user.userId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Location not found.' });
    await writeAudit(pool, req.user.userId, 'locations', Number(req.params.id), AUDIT_ACTION.UPDATE);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Location already exists.' });
    console.error('Update location error:', err);
    res.status(500).json({ error: 'Failed to update location.' });
  }
});

router.delete('/:id', requireAuth, requirePermission('Locations', 4), async (req, res) => {
  try {
    const used = await pool.query(
      'SELECT 1 FROM asset_transfer WHERE from_location_id = $1 OR to_location_id = $1 LIMIT 1',
      [req.params.id]
    );
    if (used.rows.length) return res.status(409).json({ error: 'Location is referenced by asset transfer history.' });
    const result = await pool.query('DELETE FROM locations WHERE location_id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Location not found.' });
    await writeAudit(pool, req.user.userId, 'locations', Number(req.params.id), AUDIT_ACTION.DELETE);
    res.status(204).send();
  } catch (err) {
    console.error('Delete location error:', err);
    res.status(500).json({ error: 'Failed to delete location.' });
  }
});

module.exports = router;
