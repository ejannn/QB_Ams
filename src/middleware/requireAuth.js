const jwt = require('jsonwebtoken');
const pool = require('../db/pool');


async function requireAuth(
  req,
  res,
  next
) {
  try {
    const authHeader =
      req.headers.authorization;


    if (
      !authHeader ||
      !authHeader.startsWith(
        'Bearer '
      )
    ) {
      return res
        .status(401)
        .json({
          error:
            'No token provided.',
        });
    }


    const token =
      authHeader.substring(7);


    let decoded;

    try {
      decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );
    } catch (_) {
      return res
        .status(401)
        .json({
          error:
            'Invalid or expired token.',
        });
    }


    if (!decoded?.userId) {
      return res
        .status(401)
        .json({
          error:
            'Invalid authentication token.',
        });
    }


    // --------------------------------------------------
    // Load current user state from DB.
    //
    // This means:
    // - deactivation takes effect immediately
    // - role changes take effect immediately
    // --------------------------------------------------

    const { rows } =
      await pool.query(
        `
        SELECT
          u.user_id,
          u.role_id,
          u.is_active,
          r.role_name

        FROM users u

        JOIN roles r
          ON r.role_id =
            u.role_id

        WHERE
          u.user_id = $1
        `,
        [decoded.userId]
      );


    if (!rows.length) {
      return res
        .status(401)
        .json({
          error:
            'User account no longer exists.',
        });
    }


    const user =
      rows[0];


    if (!user.is_active) {
      return res
        .status(403)
        .json({
          error:
            'User account is inactive.',
        });
    }


    req.user = {
      userId:
        user.user_id,

      roleId:
        user.role_id,

      role:
        user.role_name,
    };


    return next();

  } catch (err) {

    console.error(
      'Authentication check failed:',
      err
    );


    return res
      .status(500)
      .json({
        error:
          'Authentication check failed.',
      });
  }
}


module.exports = requireAuth;