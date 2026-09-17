const express = require('express');
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


// ======================================================
// GET ALL LOCATIONS
// ======================================================

router.get(
  '/',
  requireAuth,
  requirePermission('Locations', 2),
  async (req, res) => {
    try {
      const { rows } =
        await pool.query(
          `
          SELECT
            location_id AS "locationId",
            name,
            created_at AS "createdAt",
            updated_at AS "updatedAt"

          FROM locations

          ORDER BY name
          `
        );

      return res.json(rows);

    } catch (err) {
      console.error(
        'Fetch locations error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve locations.',
        });
    }
  }
);


// ======================================================
// GET ONE LOCATION
// ======================================================

router.get(
  '/:id',
  requireAuth,
  requirePermission('Locations', 2),
  async (req, res) => {
    try {
      const locationId =
        Number(req.params.id);

      if (
        !Number.isInteger(locationId) ||
        locationId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Location id must be a positive integer.',
          });
      }

      const { rows } =
        await pool.query(
          `
          SELECT
            location_id AS "locationId",
            name,
            created_at AS "createdAt",
            updated_at AS "updatedAt"

          FROM locations

          WHERE location_id = $1
          `,
          [locationId]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Location not found.',
          });
      }

      return res.json(rows[0]);

    } catch (err) {
      console.error(
        'Fetch location error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve location.',
        });
    }
  }
);


// ======================================================
// CREATE LOCATION
// ======================================================

router.post(
  '/',
  requireAuth,
  requirePermission('Locations', 1),
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ''
        ).trim();

      if (!name) {
        return res
          .status(400)
          .json({
            error:
              'Location name is required.',
          });
      }

      if (name.length > 150) {
        return res
          .status(400)
          .json({
            error:
              'Location name must not exceed 150 characters.',
          });
      }

      const { rows } =
        await pool.query(
          `
          INSERT INTO locations (
            name,
            created_by,
            updated_by
          )
          VALUES ($1, $2, $2)

          RETURNING
            location_id AS "locationId",
            name,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          `,
          [
            name,
            req.user.userId,
          ]
        );

      await writeAudit(
        pool,
        req.user.userId,
        'locations',
        rows[0].locationId,
        AUDIT_ACTION.CREATE
      );

      return res
        .status(201)
        .json(rows[0]);

    } catch (err) {
      if (err.code === '23505') {
        return res
          .status(409)
          .json({
            error:
              'Location already exists.',
          });
      }

      console.error(
        'Create location error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to create location.',
        });
    }
  }
);


// ======================================================
// UPDATE LOCATION
// ======================================================

router.patch(
  '/:id',
  requireAuth,
  requirePermission('Locations', 3),
  async (req, res) => {
    try {
      const locationId =
        Number(req.params.id);

      if (
        !Number.isInteger(locationId) ||
        locationId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Location id must be a positive integer.',
          });
      }

      const name =
        String(
          req.body.name || ''
        ).trim();

      if (!name) {
        return res
          .status(400)
          .json({
            error:
              'Location name is required.',
          });
      }

      if (name.length > 150) {
        return res
          .status(400)
          .json({
            error:
              'Location name must not exceed 150 characters.',
          });
      }

      const { rows } =
        await pool.query(
          `
          UPDATE locations

          SET
            name = $1,
            updated_at = NOW(),
            updated_by = $2

          WHERE location_id = $3

          RETURNING
            location_id AS "locationId",
            name,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          `,
          [
            name,
            req.user.userId,
            locationId,
          ]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Location not found.',
          });
      }

      await writeAudit(
        pool,
        req.user.userId,
        'locations',
        locationId,
        AUDIT_ACTION.UPDATE
      );

      return res.json(rows[0]);

    } catch (err) {
      if (err.code === '23505') {
        return res
          .status(409)
          .json({
            error:
              'Location already exists.',
          });
      }

      console.error(
        'Update location error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to update location.',
        });
    }
  }
);


// ======================================================
// DELETE LOCATION
// ======================================================

router.delete(
  '/:id',
  requireAuth,
  requirePermission('Locations', 4),
  async (req, res) => {
    try {
      const locationId =
        Number(req.params.id);

      if (
        !Number.isInteger(locationId) ||
        locationId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Location id must be a positive integer.',
          });
      }

      const used =
        await pool.query(
          `
          SELECT 1

          FROM asset_transfer

          WHERE
            from_location_id = $1
            OR to_location_id = $1

          LIMIT 1
          `,
          [locationId]
        );

      if (used.rows.length) {
        return res
          .status(409)
          .json({
            error:
              'Location is referenced by asset transfer history.',
          });
      }

      const result =
        await pool.query(
          `
          DELETE FROM locations

          WHERE location_id = $1
          `,
          [locationId]
        );

      if (!result.rowCount) {
        return res
          .status(404)
          .json({
            error:
              'Location not found.',
          });
      }

      await writeAudit(
        pool,
        req.user.userId,
        'locations',
        locationId,
        AUDIT_ACTION.DELETE
      );

      return res
        .status(204)
        .send();

    } catch (err) {
      console.error(
        'Delete location error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to delete location.',
        });
    }
  }
);


module.exports = router;