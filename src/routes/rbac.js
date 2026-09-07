const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { ACTION_NAMES, permissionKey } = require('../db/rbac');
const { writeAudit, AUDIT_ACTION } = require('../utils/audit');

const router = express.Router();

router.get('/roles', requireAuth, requirePermission('Roles', 2), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.role_id AS "roleId", r.role_name AS "roleName", r.description,
              r.created_at AS "createdAt",
              COALESCE(
                json_agg(json_build_object('permId', p.perm_id, 'module', p.module, 'action', p.action))
                FILTER (WHERE p.perm_id IS NOT NULL), '[]'::json
              ) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.role_id
       LEFT JOIN permissions p ON p.perm_id = rp.perm_id
       GROUP BY r.role_id
       ORDER BY r.role_id`
    );
    res.json(rows.map((role) => ({
      ...role,
      permissions: role.permissions.map((p) => ({ ...p, actionName: ACTION_NAMES[p.action], key: permissionKey(p.module, p.action) })),
    })));
  } catch (err) {
    console.error('Fetch roles error:', err);
    res.status(500).json({ error: 'Failed to retrieve roles.' });
  }
});

router.get('/permissions', requireAuth, requirePermission('Roles', 2), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT perm_id AS "permId", module, action, description FROM permissions ORDER BY module, action');
    res.json(rows.map((p) => ({ ...p, actionName: ACTION_NAMES[p.action], key: permissionKey(p.module, p.action) })));
  } catch (err) {
    console.error('Fetch permissions error:', err);
    res.status(500).json({ error: 'Failed to retrieve permissions.' });
  }
});

router.post('/roles', requireAuth, requirePermission('Roles', 1), async (req, res) => {
  try {
    const roleName = String(req.body.roleName || '').trim();
    if (!roleName) return res.status(400).json({ error: 'roleName is required.' });
    const { rows } = await pool.query(
      `INSERT INTO roles (role_name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING role_id AS "roleId", role_name AS "roleName", description, created_at AS "createdAt"`,
      [roleName, req.body.description || null, req.user.userId]
    );
    await writeAudit(pool, req.user.userId, 'roles', rows[0].roleId, AUDIT_ACTION.CREATE);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Role already exists.' });
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Failed to create role.' });
  }
});

router.put('/roles/:id/permissions', requireAuth, requirePermission('Roles', 3), async (req, res) => {
  const client = await pool.connect();
  try {
    const permIds = Array.isArray(req.body.permIds) ? req.body.permIds.map(Number) : null;
    if (!permIds) return res.status(400).json({ error: 'permIds must be an array.' });

    await client.query('BEGIN');
    const role = await client.query('SELECT role_id FROM roles WHERE role_id = $1', [req.params.id]);
    if (!role.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Role not found.' });
    }
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [req.params.id]);
    for (const permId of permIds) {
      await client.query(
        `INSERT INTO role_permissions (role_id, perm_id) VALUES ($1, $2)
         ON CONFLICT (role_id, perm_id) DO NOTHING`,
        [req.params.id, permId]
      );
    }
    await writeAudit(client, req.user.userId, 'roles', Number(req.params.id), AUDIT_ACTION.UPDATE);
    await client.query('COMMIT');
    res.json({ message: 'Role permissions updated.', roleId: Number(req.params.id), permIds });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (err.code === '23503') return res.status(400).json({ error: 'One or more permIds do not exist.' });
    console.error('Update role permissions error:', err);
    res.status(500).json({ error: 'Failed to update role permissions.' });
  } finally {
    client.release();
  }
});

module.exports = router;
