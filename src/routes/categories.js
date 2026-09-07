const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { writeAudit, AUDIT_ACTION } = require('../utils/audit');

const router = express.Router();

router.get('/', requireAuth, requirePermission('Categories', 2), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT category_id AS "categoryId", name, created_at AS "createdAt", updated_at AS "updatedAt" FROM categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Fetch categories error:', err);
    res.status(500).json({ error: 'Failed to retrieve categories.' });
  }
});

router.post('/', requireAuth, requirePermission('Categories', 1), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const { rows } = await pool.query(
      `INSERT INTO categories (name, created_by, updated_by)
       VALUES ($1, $2, $2)
       RETURNING category_id AS "categoryId", name, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, req.user.userId]
    );
    await writeAudit(pool, req.user.userId, 'categories', rows[0].categoryId, AUDIT_ACTION.CREATE);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category already exists.' });
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

router.patch('/:id', requireAuth, requirePermission('Categories', 3), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const { rows } = await pool.query(
      `UPDATE categories SET name = $1, updated_at = NOW(), updated_by = $2
       WHERE category_id = $3
       RETURNING category_id AS "categoryId", name, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, req.user.userId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found.' });
    await writeAudit(pool, req.user.userId, 'categories', Number(req.params.id), AUDIT_ACTION.UPDATE);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category already exists.' });
    console.error('Update category error:', err);
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

router.delete('/:id', requireAuth, requirePermission('Categories', 4), async (req, res) => {
  try {
    const used = await pool.query('SELECT 1 FROM assets WHERE category_id = $1 LIMIT 1', [req.params.id]);
    if (used.rows.length) return res.status(409).json({ error: 'Category is in use by one or more assets.' });
    const result = await pool.query('DELETE FROM categories WHERE category_id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Category not found.' });
    await writeAudit(pool, req.user.userId, 'categories', Number(req.params.id), AUDIT_ACTION.DELETE);
    res.status(204).send();
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

module.exports = router;
