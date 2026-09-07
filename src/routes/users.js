const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');
const { writeAudit, AUDIT_ACTION } = require('../utils/audit');

const router = express.Router();
const SALT_ROUNDS = 10;

const USER_SELECT = `
  SELECT u.user_id AS "userId", u.email, u.role_id AS "roleId", r.role_name AS role,
         u.created_at AS "createdAt", u.updated_at AS "updatedAt",
         d.first_name AS "firstName", d.middle_name AS "middleName",
         d.last_name AS "lastName", d.extension,
         CONCAT_WS(' ', d.first_name, d.middle_name, d.last_name, d.extension) AS name
  FROM users u
  JOIN roles r ON r.role_id = u.role_id
  LEFT JOIN user_details d ON d.user_id = u.user_id
`;

router.get('/', requireAuth, requirePermission('Users', 2), async (req, res) => {
  try {
    const { rows } = await pool.query(`${USER_SELECT} ORDER BY u.created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
});

router.get('/:id', requireAuth, requirePermission('Users', 2), async (req, res) => {
  try {
    const { rows } = await pool.query(`${USER_SELECT} WHERE u.user_id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Fetch user error:', err);
    res.status(500).json({ error: 'Failed to retrieve user.' });
  }
});

router.post('/', requireAuth, requirePermission('Users', 1), async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password, roleId, firstName, middleName = null, lastName, extension = null } = req.body;
    if (!email || !password || !roleId || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, password, roleId, firstName, and lastName are required.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, role_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING user_id`,
      [email.toLowerCase().trim(), passwordHash, roleId, req.user.userId]
    );
    const userId = rows[0].user_id;
    await client.query(
      `INSERT INTO user_details (user_id, first_name, middle_name, last_name, extension)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, firstName.trim(), middleName, lastName.trim(), extension]
    );
    await writeAudit(client, req.user.userId, 'users', userId, AUDIT_ACTION.CREATE);
    await client.query('COMMIT');

    const result = await pool.query(`${USER_SELECT} WHERE u.user_id = $1`, [userId]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists.' });
    if (err.code === '23503') return res.status(400).json({ error: 'roleId does not exist.' });
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user.' });
  } finally {
    client.release();
  }
});

router.patch('/:id', requireAuth, requirePermission('Users', 3), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userCheck = await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [req.params.id]);
    if (!userCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }

    const userFields = [];
    const userValues = [];
    let i = 1;
    const addUser = (column, value) => {
      if (value !== undefined) {
        userFields.push(`${column} = $${i++}`);
        userValues.push(value);
      }
    };
    addUser('email', req.body.email?.toLowerCase().trim());
    addUser('role_id', req.body.roleId);
    if (req.body.password !== undefined) {
      if (String(req.body.password).length < 8) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }
      addUser('password_hash', await bcrypt.hash(req.body.password, SALT_ROUNDS));
    }
    if (userFields.length) {
      userFields.push('updated_at = NOW()');
      userFields.push(`updated_by = $${i++}`);
      userValues.push(req.user.userId);
      userValues.push(req.params.id);
      await client.query(`UPDATE users SET ${userFields.join(', ')} WHERE user_id = $${i}`, userValues);
    }

    const details = {
      first_name: req.body.firstName,
      middle_name: req.body.middleName,
      last_name: req.body.lastName,
      extension: req.body.extension,
    };
    const detailEntries = Object.entries(details).filter(([, v]) => v !== undefined);
    if (detailEntries.length) {
      const dFields = [];
      const dValues = [];
      let d = 1;
      for (const [column, value] of detailEntries) {
        dFields.push(`${column} = $${d++}`);
        dValues.push(value);
      }
      dValues.push(req.params.id);
      await client.query(
        `UPDATE user_details SET ${dFields.join(', ')}, updated_at = NOW() WHERE user_id = $${d}`,
        dValues
      );
    }

    if (!userFields.length && !detailEntries.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No user fields provided.' });
    }

    await writeAudit(client, req.user.userId, 'users', Number(req.params.id), AUDIT_ACTION.UPDATE);
    await client.query('COMMIT');
    const { rows } = await pool.query(`${USER_SELECT} WHERE u.user_id = $1`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists.' });
    if (err.code === '23503') return res.status(400).json({ error: 'roleId does not exist.' });
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user.' });
  } finally {
    client.release();
  }
});

module.exports = router;
