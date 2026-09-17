const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../db/pool');

const requireAuth =
  require('../middleware/requireAuth');

const {
  getUserRole,
  getUserPermissions,
} = require('../db/rbac');


const router = express.Router();

const SALT_ROUNDS = 10;


// ======================================================
// EMAIL HELPERS
// ======================================================

function normalizeEmail(value) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}


function validSchoolEmail(value) {
  const email =
    normalizeEmail(value);

  return /^[^\s@]+@dbtc-cebu\.edu\.ph$/i
    .test(email);
}


// ======================================================
// DISPLAY NAME
// ======================================================

function displayName(row) {
  return [
    row.first_name,
    row.middle_name,
    row.last_name,
    row.extension,
  ]
    .filter(Boolean)
    .join(' ');
}


// ======================================================
// SIGNUP
// ======================================================

router.post(
  '/signup',
  async (req, res) => {

    if (
      String(
        process.env.ALLOW_SIGNUP ||
        'false'
      ).toLowerCase() !==
      'true'
    ) {
      return res
        .status(403)
        .json({
          error:
            'Public signup is disabled. Ask an administrator to create your account.',
        });
    }


    const client =
      await pool.connect();


    try {

      const {
        password,
        firstName,
        middleName = null,
        lastName,
        extension = null,
      } = req.body;


      const email =
        normalizeEmail(
          req.body.email
        );


      if (
        !email ||
        !password ||
        !firstName ||
        !lastName
      ) {
        return res
          .status(400)
          .json({
            error:
              'email, password, firstName, and lastName are required.',
          });
      }


      if (
        !validSchoolEmail(email)
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


      const roleName =
        process.env
          .DEFAULT_SIGNUP_ROLE ||
        'Custodian';


      const roleResult =
        await client.query(
          `
          SELECT role_id

          FROM roles

          WHERE
            LOWER(role_name) =
            LOWER($1)
          `,
          [roleName]
        );


      if (
        !roleResult.rows.length
      ) {
        return res
          .status(500)
          .json({
            error:
              'Default signup role is not configured.',
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


      const userResult =
        await client.query(
          `
          INSERT INTO users (
            email,
            password_hash,
            role_id
          )
          VALUES ($1, $2, $3)

          RETURNING
            user_id,
            email,
            role_id,
            is_active,
            created_at
          `,
          [
            email,
            passwordHash,
            roleResult.rows[0]
              .role_id,
          ]
        );


      const user =
        userResult.rows[0];


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
          user.user_id,
          String(firstName).trim(),
          middleName,
          String(lastName).trim(),
          extension,
        ]
      );


      await client.query(
        'COMMIT'
      );


      return res
        .status(201)
        .json({
          message:
            'Account created.',

          user: {
            userId:
              user.user_id,

            email:
              user.email,

            role:
              roleName,

            isActive:
              user.is_active,
          },
        });

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
              'An account with this email already exists.',
          });
      }


      console.error(
        'Signup error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Something went wrong creating your account.',
        });

    } finally {

      client.release();

    }
  }
);


// ======================================================
// LOGIN
// ======================================================

router.post(
  '/login',
  async (req, res) => {

    try {

      const email =
        normalizeEmail(
          req.body.email
        );

      const password =
        req.body.password;


      if (
        !email ||
        !password
      ) {
        return res
          .status(400)
          .json({
            error:
              'Email and password are required.',
          });
      }


      if (
        !validSchoolEmail(email)
      ) {
        return res
          .status(400)
          .json({
            error:
              'Email must use the @dbtc-cebu.edu.ph domain.',
          });
      }


      const { rows } =
        await pool.query(
          `
          SELECT
            u.user_id,
            u.email,
            u.password_hash,
            u.role_id,
            u.is_active,

            d.first_name,
            d.middle_name,
            d.last_name,
            d.extension,

            r.role_name

          FROM users u

          JOIN roles r
            ON r.role_id =
              u.role_id

          LEFT JOIN user_details d
            ON d.user_id =
              u.user_id

          WHERE
            LOWER(u.email) =
            LOWER($1)
          `,
          [email]
        );


      const user =
        rows[0];


      if (
        !user ||
        !(
          await bcrypt.compare(
            password,
            user.password_hash
          )
        )
      ) {
        return res
          .status(401)
          .json({
            error:
              'Invalid email or password.',
          });
      }


      if (!user.is_active) {
        return res
          .status(403)
          .json({
            error:
              'User account is inactive.',
          });
      }


      const permissions =
        await getUserPermissions(
          user.user_id
        );


      const token =
        jwt.sign(
          {
            userId:
              user.user_id,

            roleId:
              user.role_id,

            role:
              user.role_name,
          },

          process.env.JWT_SECRET,

          {
            expiresIn:
              process.env
                .JWT_EXPIRES_IN ||
              '1d',
          }
        );


      return res.json({
        token,

        user: {
          userId:
            user.user_id,

          email:
            user.email,

          name:
            displayName(user) ||
            user.email,

          roleId:
            user.role_id,

          role:
            user.role_name,

          isActive:
            user.is_active,

          permissions:
            permissions.map(
              (p) => p.key
            ),
        },
      });

    } catch (err) {

      console.error(
        'Login error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Something went wrong logging you in.',
        });
    }
  }
);


// ======================================================
// CURRENT USER
// ======================================================

router.get(
  '/me',
  requireAuth,
  async (req, res) => {

    try {

      const role =
        await getUserRole(
          req.user.userId
        );


      if (!role) {
        return res
          .status(404)
          .json({
            error:
              'User not found.',
          });
      }


      const { rows } =
        await pool.query(
          `
          SELECT
            u.user_id,
            u.email,
            u.is_active,

            d.first_name,
            d.middle_name,
            d.last_name,
            d.extension

          FROM users u

          LEFT JOIN user_details d
            ON d.user_id =
              u.user_id

          WHERE
            u.user_id = $1
          `,
          [req.user.userId]
        );


      const permissions =
        await getUserPermissions(
          req.user.userId
        );


      const user =
        rows[0];


      return res.json({
        user: {
          userId:
            user.user_id,

          email:
            user.email,

          name:
            displayName(user) ||
            user.email,

          roleId:
            role.role_id,

          role:
            role.role_name,

          isActive:
            user.is_active,

          permissions:
            permissions.map(
              (p) => p.key
            ),
        },
      });

    } catch (err) {

      console.error(
        'Auth me error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve current user.',
        });
    }
  }
);


module.exports = router;