const pool = require('./pool');

const ACTION_NAMES = {
  1: 'create',
  2: 'read',
  3: 'update',
  4: 'delete',
};

function permissionKey(module, action) {
  return `${String(module).trim().toLowerCase().replace(/\s+/g, '_')}:${ACTION_NAMES[action] || action}`;
}

async function getUserRole(userId) {
  const { rows } = await pool.query(
    `SELECT r.role_id, r.role_name
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function getUserPermissions(userId) {
  const { rows } = await pool.query(
    `SELECT p.perm_id, p.module, p.action, p.description
     FROM users u
     JOIN role_permissions rp ON rp.role_id = u.role_id
     JOIN permissions p ON p.perm_id = rp.perm_id
     WHERE u.user_id = $1
     ORDER BY p.module, p.action`,
    [userId]
  );

  return rows.map((row) => ({
    ...row,
    key: permissionKey(row.module, row.action),
    actionName: ACTION_NAMES[row.action],
  }));
}

async function userHasPermission(userId, module, action) {
  const { rows } = await pool.query(
    `SELECT 1
     FROM users u
     JOIN role_permissions rp ON rp.role_id = u.role_id
     JOIN permissions p ON p.perm_id = rp.perm_id
     WHERE u.user_id = $1
       AND LOWER(p.module) = LOWER($2)
       AND p.action = $3
     LIMIT 1`,
    [userId, module, action]
  );
  return rows.length > 0;
}

module.exports = {
  ACTION_NAMES,
  permissionKey,
  getUserRole,
  getUserPermissions,
  userHasPermission,
};
