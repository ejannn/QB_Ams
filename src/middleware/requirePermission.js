const { userHasPermission } = require('../db/rbac');

/**
 * ERD permission actions:
 * 1 Create, 2 Read, 3 Update, 4 Delete
 */
function requirePermission(module, action) {
  return async (req, res, next) => {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      if (String(req.user.role || '').toLowerCase() === 'admin') {
        return next();
      }

      const allowed = await userHasPermission(req.user.userId, module, action);
      if (!allowed) {
        return res.status(403).json({
          error: `Permission denied for ${module} action ${action}.`,
        });
      }

      return next();
    } catch (err) {
      console.error('Permission check failed:', err);
      return res.status(500).json({ error: 'Authorization check failed.' });
    }
  };
}

module.exports = requirePermission;
