const express = require('express');
const bcrypt = require('bcrypt');

const pool = require('../db/pool');

const requireAuth =
  require('../middleware/requireAuth');

const requirePermission =
  require('../middleware/requirePermission');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../utils/audit');


const router = express.Router();

const SALT_ROUNDS = 10;


// ======================================================
// HELPERS
// ======================================================

function normalizeEmail(value) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}


function validSchoolEmail(value) {
  return /^[^\s@]+@dbtc-cebu\.edu\.ph$/i
    .test(
      normalizeEmail(value)
    );
}


function positiveInteger(value) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  );
}


// ======================================================
// SELECT
// ======================================================

const USER_SELECT = `
  SELECT
    u.user_id
      AS "userId",

    u.email,

    u.role_id
      AS "roleId",

    r.role_name
      AS role,

    u.is_active
      AS "isActive",

    u.created_at
      AS "createdAt",

    u.updated_at
      AS "updatedAt",

    d.first_name
      AS "firstName",

    d.middle_name
      AS "middleName",

    d.last_name
      AS "lastName",

    d.extension,

    CONCAT_WS(
      ' ',
      d.first_name,
      d.middle_name,
      d.last_name,
      d.extension
    ) AS name

  FROM users u

  JOIN roles r
    ON r.role_id =
      u.role_id

  LEFT JOIN user_details d
    ON d.user_id =
      u.user_id
`;


// ======================================================
// GET ALL USERS
// ======================================================

router.get(
  '/',
  requireAuth,
  requirePermission('Users', 2),
  async (req, res) => {

    try {

      const { rows } =
        await pool.query(
          `
          ${USER_SELECT}

          ORDER BY
            u.created_at DESC
          `
        );


      return res.json(rows);

    } catch (err) {

      console.error(
        'Fetch users error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve users.',
        });
    }
  }
);


// ======================================================
// GET ONE USER
// ======================================================

router.get(
  '/:id',
  requireAuth,
  requirePermission('Users', 2),
  async (req, res) => {

    try {

      const userId =
        Number(req.params.id);


      if (
        !positiveInteger(
          userId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'User id must be a positive integer.',
          });
      }


      const { rows } =
        await pool.query(
          `
          ${USER_SELECT}

          WHERE
            u.user_id = $1
          `,
          [userId]
        );


      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'User not found.',
          });
      }


      return res.json(
        rows[0]
      );

    } catch (err) {

      console.error(
        'Fetch user error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve user.',
        });
    }
  }
);


// ======================================================
// CREATE USER
// ======================================================

router.post(
  '/',
  requireAuth,
  requirePermission('Users', 1),
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const email =
        normalizeEmail(
          req.body.email
        );


      const {
        password,
        roleId,
        firstName,
        middleName = null,
        lastName,
        extension = null,
      } = req.body;


      if (
        !email ||
        !password ||
        !roleId ||
        !firstName ||
        !lastName
      ) {
        return res
          .status(400)
          .json({
            error:
              'email, password, roleId, firstName, and lastName are required.',
          });
      }


      if (
        !validSchoolEmail(
          email
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'Email must use the @dbtc-cebu.edu.ph domain.',
          });
      }


      if (
        String(password).length <
        8
      ) {
        return res
          .status(400)
          .json({
            error:
              'Password must be at least 8 characters.',
          });
      }


      if (
        !positiveInteger(
          roleId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'roleId must be a positive integer.',
          });
      }


      await client.query(
        'BEGIN'
      );


      const passwordHash =
        await bcrypt.hash(
          password,
          SALT_ROUNDS
        );


      const { rows } =
        await client.query(
          `
          INSERT INTO users (
            email,
            password_hash,
            role_id,
            created_by,
            updated_by
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $4
          )

          RETURNING user_id
          `,
          [
            email,
            passwordHash,
            Number(roleId),
            req.user.userId,
          ]
        );


      const userId =
        rows[0].user_id;


      await client.query(
        `
        INSERT INTO user_details (
          user_id,
          first_name,
          middle_name,
          last_name,
          extension
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5
        )
        `,
        [
          userId,
          String(firstName).trim(),
          middleName,
          String(lastName).trim(),
          extension,
        ]
      );


      await writeAudit(
        client,
        req.user.userId,
        'users',
        userId,
        AUDIT_ACTION.CREATE
      );


      await client.query(
        'COMMIT'
      );


      const result =
        await pool.query(
          `
          ${USER_SELECT}

          WHERE
            u.user_id = $1
          `,
          [userId]
        );


      return res
        .status(201)
        .json(
          result.rows[0]
        );

    } catch (err) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}


      if (
        err.code === '23505'
      ) {
        return res
          .status(409)
          .json({
            error:
              'Email already exists.',
          });
      }


      if (
        err.code === '23503'
      ) {
        return res
          .status(400)
          .json({
            error:
              'roleId does not exist.',
          });
      }


      console.error(
        'Create user error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to create user.',
        });

    } finally {

      client.release();

    }
  }
);


// ======================================================
// UPDATE USER
// ======================================================

router.patch(
  '/:id',
  requireAuth,
  requirePermission('Users', 3),
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const userId =
        Number(req.params.id);


      if (
        !positiveInteger(
          userId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'User id must be a positive integer.',
          });
      }


      await client.query(
        'BEGIN'
      );


      const userCheck =
        await client.query(
          `
          SELECT
            user_id,
            role_id,
            is_active

          FROM users

          WHERE
            user_id = $1

          FOR UPDATE
          `,
          [userId]
        );


      if (
        !userCheck.rows.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(404)
          .json({
            error:
              'User not found.',
          });
      }


      // Prevent accidental loss of
      // current administrator access.

      if (
        userId ===
          req.user.userId &&
        req.body.roleId !==
          undefined &&
        Number(req.body.roleId) !==
          Number(req.user.roleId)
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(409)
          .json({
            error:
              'You cannot change your own role.',
          });
      }


      if (
        userId ===
          req.user.userId &&
        req.body.isActive ===
          false
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(409)
          .json({
            error:
              'You cannot deactivate your own account.',
          });
      }


      if (
        req.body.email !==
        undefined &&
        !validSchoolEmail(
          req.body.email
        )
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            error:
              'Email must use the @dbtc-cebu.edu.ph domain.',
          });
      }


      if (
        req.body.roleId !==
          undefined &&
        !positiveInteger(
          req.body.roleId
        )
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            error:
              'roleId must be a positive integer.',
          });
      }


      if (
        req.body.isActive !==
          undefined &&
        typeof req.body
          .isActive !== 'boolean'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            error:
              'isActive must be a boolean.',
          });
      }


      // Cannot deactivate someone who
      // currently holds assets.

      if (
        req.body.isActive ===
        false
      ) {

        const custody =
          await client.query(
            `
            SELECT 1

            FROM asset_custody

            WHERE
              custodian_user_id = $1
              AND returned_at
                IS NULL

            LIMIT 1
            `,
            [userId]
          );


        if (
          custody.rows.length
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res
            .status(409)
            .json({
              error:
                'User has active custody assignments. Return or reassign those assets first.',
            });
        }
      }


      const userFields = [];
      const userValues = [];

      let index = 1;


      if (
        req.body.email !==
        undefined
      ) {
        userFields.push(
          `email = $${index++}`
        );

        userValues.push(
          normalizeEmail(
            req.body.email
          )
        );
      }


      if (
        req.body.roleId !==
        undefined
      ) {
        userFields.push(
          `role_id = $${index++}`
        );

        userValues.push(
          Number(
            req.body.roleId
          )
        );
      }


      if (
        req.body.isActive !==
        undefined
      ) {
        userFields.push(
          `is_active = $${index++}`
        );

        userValues.push(
          req.body.isActive
        );
      }


      if (
        req.body.password !==
        undefined
      ) {

        if (
          String(
            req.body.password
          ).length < 8
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res
            .status(400)
            .json({
              error:
                'Password must be at least 8 characters.',
            });
        }


        const passwordHash =
          await bcrypt.hash(
            req.body.password,
            SALT_ROUNDS
          );


        userFields.push(
          `password_hash = $${index++}`
        );

        userValues.push(
          passwordHash
        );
      }


      if (
        userFields.length
      ) {

        userFields.push(
          'updated_at = NOW()'
        );

        userFields.push(
          `updated_by = $${index++}`
        );

        userValues.push(
          req.user.userId
        );

        userValues.push(
          userId
        );


        await client.query(
          `
          UPDATE users

          SET
            ${userFields.join(', ')}

          WHERE
            user_id = $${index}
          `,
          userValues
        );
      }


      const details = {
        first_name:
          req.body.firstName,

        middle_name:
          req.body.middleName,

        last_name:
          req.body.lastName,

        extension:
          req.body.extension,
      };


      const detailEntries =
        Object.entries(
          details
        ).filter(
          ([, value]) =>
            value !== undefined
        );


      if (
        detailEntries.length
      ) {

        const fields = [];
        const values = [];

        let detailIndex = 1;


        for (
          const [
            column,
            value,
          ] of detailEntries
        ) {
          fields.push(
            `${column} = $${detailIndex++}`
          );

          values.push(
            value
          );
        }


        values.push(
          userId
        );


        await client.query(
          `
          UPDATE user_details

          SET
            ${fields.join(', ')},
            updated_at = NOW()

          WHERE
            user_id =
              $${detailIndex}
          `,
          values
        );
      }


      if (
        !userFields.length &&
        !detailEntries.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            error:
              'No user fields provided.',
          });
      }


      await writeAudit(
        client,
        req.user.userId,
        'users',
        userId,
        AUDIT_ACTION.UPDATE
      );


      await client.query(
        'COMMIT'
      );


      const { rows } =
        await pool.query(
          `
          ${USER_SELECT}

          WHERE
            u.user_id = $1
          `,
          [userId]
        );


      return res.json(
        rows[0]
      );

    } catch (err) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}


      if (
        err.code === '23505'
      ) {
        return res
          .status(409)
          .json({
            error:
              'Email already exists.',
          });
      }


      if (
        err.code === '23503'
      ) {
        return res
          .status(400)
          .json({
            error:
              'roleId does not exist.',
          });
      }


      console.error(
        'Update user error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to update user.',
        });

    } finally {

      client.release();

    }
  }
);


// ======================================================
// SOFT-DEACTIVATE USER
// ======================================================

router.delete(
  '/:id',
  requireAuth,
  requirePermission('Users', 4),
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      const userId =
        Number(req.params.id);


      if (
        !positiveInteger(
          userId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'User id must be a positive integer.',
          });
      }


      if (
        userId ===
        req.user.userId
      ) {
        return res
          .status(409)
          .json({
            error:
              'You cannot deactivate your own account.',
          });
      }


      await client.query(
        'BEGIN'
      );


      const user =
        await client.query(
          `
          SELECT
            user_id,
            is_active

          FROM users

          WHERE
            user_id = $1

          FOR UPDATE
          `,
          [userId]
        );


      if (!user.rows.length) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(404)
          .json({
            error:
              'User not found.',
          });
      }


      if (
        !user.rows[0]
          .is_active
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(409)
          .json({
            error:
              'User is already inactive.',
          });
      }


      const custody =
        await client.query(
          `
          SELECT 1

          FROM asset_custody

          WHERE
            custodian_user_id = $1
            AND returned_at
              IS NULL

          LIMIT 1
          `,
          [userId]
        );


      if (
        custody.rows.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(409)
          .json({
            error:
              'User has active custody assignments. Return or reassign those assets first.',
          });
      }


      await client.query(
        `
        UPDATE users

        SET
          is_active = FALSE,
          updated_at = NOW(),
          updated_by = $2

        WHERE
          user_id = $1
        `,
        [
          userId,
          req.user.userId,
        ]
      );


      await writeAudit(
        client,
        req.user.userId,
        'users',
        userId,
        AUDIT_ACTION.DELETE
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        message:
          'User deactivated.',

        userId,
      });

    } catch (err) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}


      console.error(
        'Deactivate user error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to deactivate user.',
        });

    } finally {

      client.release();

    }
  }
);


module.exports = router;