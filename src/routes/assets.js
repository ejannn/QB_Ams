const express = require('express');
const { randomUUID } = require('crypto');

const pool = require('../db/pool');

const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../utils/audit');

const {
  addAssetLabels,
} = require('../utils/labels');

const router = express.Router();

// ==========================================================
// ASSET SELECT
// ==========================================================

const ASSET_SELECT = `
  SELECT
    a.asset_id AS "assetId",
    a.asset_name AS "assetName",

    a.qr_id AS "qrId",
    q.qr_code_url AS "qrCodeUrl",
    q.is_active AS "qrIsActive",
    q.is_printed AS "qrIsPrinted",

    a.category_id AS "categoryId",
    c.name AS "categoryName",

    a.serial_no AS "serialNo",
    a.brand,
    a.model,

    a.purchase_date AS "purchaseDate",

    a.asset_image_url AS "assetImageUrl",

    a.custodian_user_id AS "custodianUserId",

    CONCAT_WS(
      ' ',
      custodian_details.first_name,
      custodian_details.middle_name,
      custodian_details.last_name,
      custodian_details.extension
    ) AS "custodianName",

    custodian.email AS "custodianEmail",

    a.status,

    a.created_at AS "createdAt",
    a.updated_at AS "updatedAt",

    latest_transfer.to_location_id AS "currentLocationId",
    loc.name AS "currentLocationName",

    latest_maintenance.condition,

    latest_maintenance.repair_status AS "repairStatus"

  FROM assets a

  JOIN asset_qr q
    ON q.qr_id = a.qr_id

  JOIN categories c
    ON c.category_id = a.category_id

  LEFT JOIN users custodian
    ON custodian.user_id = a.custodian_user_id

  LEFT JOIN user_details custodian_details
    ON custodian_details.user_id = custodian.user_id

  LEFT JOIN LATERAL (
    SELECT
      t.to_location_id

    FROM asset_transfer t

    WHERE t.asset_id = a.asset_id

    ORDER BY
      t.created_at DESC,
      t.asset_transfer_id DESC

    LIMIT 1
  ) latest_transfer
    ON TRUE

  LEFT JOIN locations loc
    ON loc.location_id = latest_transfer.to_location_id

  LEFT JOIN LATERAL (
    SELECT
      m.condition,
      m.repair_status

    FROM maintenance m

    WHERE m.asset_id = a.asset_id

    ORDER BY
      m.created_at DESC,
      m.maintenance_id DESC

    LIMIT 1
  ) latest_maintenance
    ON TRUE
`;

// ==========================================================
// HELPERS
// ==========================================================

function isIntIn(value, allowed) {
  const number = Number(value);

  return (
    Number.isInteger(number) &&
    allowed.includes(number)
  );
}

function nullableText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const cleaned = String(value).trim();

  return cleaned || null;
}

function nullableInteger(value) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    return NaN;
  }

  return number;
}

/**
 * Check that a selected custodian:
 * 1. exists
 * 2. has the Custodian role
 */
async function validateCustodian(
  client,
  custodianUserId
) {
  const result = await client.query(
    `
    SELECT
      u.user_id,
      u.email,
      r.role_name

    FROM users u

    JOIN roles r
      ON r.role_id = u.role_id

    WHERE u.user_id = $1
    `,
    [custodianUserId]
  );

  if (!result.rows.length) {
    return {
      valid: false,
      error:
        'custodianUserId does not exist.',
    };
  }

  if (
    result.rows[0].role_name !==
    'Custodian'
  ) {
    return {
      valid: false,
      error:
        'The selected user must have the Custodian role.',
    };
  }

  return {
    valid: true,
    user: result.rows[0],
  };
}

// ==========================================================
// GET ALL ASSETS
// GET /api/assets
// ==========================================================

router.get(
  '/',
  requireAuth,
  requirePermission('Assets', 2),

  async (req, res) => {
    try {
      const conditions = [];
      const values = [];

      let i = 1;

      // ---------------------------------------------
      // STATUS FILTER
      // ---------------------------------------------

      if (
        req.query.status !==
        undefined
      ) {
        conditions.push(
          `a.status = $${i++}`
        );

        values.push(
          Number(req.query.status)
        );
      }

      // ---------------------------------------------
      // CATEGORY FILTER
      // ---------------------------------------------

      if (req.query.categoryId) {
        conditions.push(
          `a.category_id = $${i++}`
        );

        values.push(
          Number(
            req.query.categoryId
          )
        );
      }

      // ---------------------------------------------
      // LOCATION FILTER
      // ---------------------------------------------

      if (req.query.locationId) {
        conditions.push(
          `latest_transfer.to_location_id = $${i++}`
        );

        values.push(
          Number(
            req.query.locationId
          )
        );
      }

      // ---------------------------------------------
      // CUSTODIAN FILTER
      // ---------------------------------------------

      if (
        req.query.custodianUserId
      ) {
        conditions.push(
          `a.custodian_user_id = $${i++}`
        );

        values.push(
          Number(
            req.query
              .custodianUserId
          )
        );
      }

      // ---------------------------------------------
      // SEARCH
      // ---------------------------------------------

      if (req.query.q) {
        conditions.push(`
          (
            a.asset_name ILIKE $${i}
            OR a.serial_no ILIKE $${i}
            OR a.brand ILIKE $${i}
            OR a.model ILIKE $${i}
            OR c.name ILIKE $${i}
            OR q.qr_code_url ILIKE $${i}
            OR custodian.email ILIKE $${i}
            OR CONCAT_WS(
              ' ',
              custodian_details.first_name,
              custodian_details.middle_name,
              custodian_details.last_name,
              custodian_details.extension
            ) ILIKE $${i}
          )
        `);

        values.push(
          `%${req.query.q}%`
        );

        i++;
      }

      const where =
        conditions.length
          ? `WHERE ${conditions.join(
              ' AND '
            )}`
          : '';

      const { rows } =
        await pool.query(
          `
          ${ASSET_SELECT}

          ${where}

          ORDER BY
            a.created_at DESC
          `,
          values
        );

      res.json(
        rows.map(
          addAssetLabels
        )
      );
    } catch (err) {
      console.error(
        'Fetch assets error:',
        err
      );

      res.status(500).json({
        error:
          'Failed to retrieve assets.',
      });
    }
  }
);

// ==========================================================
// SCAN QR
// GET /api/assets/scan?code=...
// ==========================================================

router.get(
  '/scan',
  requireAuth,
  requirePermission('Assets', 2),

  async (req, res) => {
    try {
      const code = String(
        req.query.code || ''
      ).trim();

      if (!code) {
        return res
          .status(400)
          .json({
            error:
              'QR code is required in ?code=.',
          });
      }

      const { rows } =
        await pool.query(
          `
          ${ASSET_SELECT}

          WHERE
            q.qr_code_url = $1

          LIMIT 1
          `,
          [code]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Asset not found for this QR code.',
          });
      }

      res.json(
        addAssetLabels(
          rows[0]
        )
      );
    } catch (err) {
      console.error(
        'Scan asset error:',
        err
      );

      res.status(500).json({
        error:
          'Failed to retrieve scanned asset.',
      });
    }
  }
);

// ==========================================================
// GET ONE ASSET
// GET /api/assets/:id
// ==========================================================

router.get(
  '/:id',
  requireAuth,
  requirePermission('Assets', 2),

  async (req, res) => {
    try {
      const { rows } =
        await pool.query(
          `
          ${ASSET_SELECT}

          WHERE
            a.asset_id = $1

          LIMIT 1
          `,
          [req.params.id]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Asset not found.',
          });
      }

      res.json(
        addAssetLabels(
          rows[0]
        )
      );
    } catch (err) {
      console.error(
        'Fetch asset error:',
        err
      );

      res.status(500).json({
        error:
          'Failed to retrieve asset.',
      });
    }
  }
);

// ==========================================================
// CREATE ASSET
// POST /api/assets
// ==========================================================

router.post(
  '/',
  requireAuth,
  requirePermission('Assets', 1),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const {
        assetName,
        categoryId,

        serialNo = null,
        brand = null,
        model = null,

        purchaseDate = null,

        custodianUserId = null,

        assetImageUrl = null,

        status = 1,

        qrCodeUrl = null,

        locationId = null,

        condition = 0,

        repairStatus = 0,

        transferReason =
          'Initial asset location',
      } = req.body;

      // ---------------------------------------------
      // BASIC VALIDATION
      // ---------------------------------------------

      if (
        !assetName ||
        !String(
          assetName
        ).trim()
      ) {
        return res
          .status(400)
          .json({
            error:
              'assetName is required.',
          });
      }

      if (!categoryId) {
        return res
          .status(400)
          .json({
            error:
              'categoryId is required.',
          });
      }

      if (
        !Number.isInteger(
          Number(categoryId)
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'categoryId must be an integer.',
          });
      }

      if (
        !isIntIn(
          status,
          [0, 1]
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'status must be 0 (Inactive) or 1 (Active).',
          });
      }

      if (
        !isIntIn(
          condition,
          [0, 1, 2]
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'condition must be 0 (New), 1 (Good), or 2 (Damaged).',
          });
      }

      if (
        !isIntIn(
          repairStatus,
          [0, 1, 2]
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'repairStatus must be 0 (No Repair), 1 (In Repair), or 2 (Discard).',
          });
      }

      const normalizedCustodianId =
        nullableInteger(
          custodianUserId
        );

      if (
        Number.isNaN(
          normalizedCustodianId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'custodianUserId must be an integer or null.',
          });
      }

      const normalizedLocationId =
        nullableInteger(
          locationId
        );

      if (
        Number.isNaN(
          normalizedLocationId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'locationId must be an integer or null.',
          });
      }

      const normalizedPurchaseDate =
        nullableText(
          purchaseDate
        );

      const normalizedImageUrl =
        nullableText(
          assetImageUrl
        );

      const normalizedSerialNo =
        nullableText(
          serialNo
        );

      const normalizedBrand =
        nullableText(
          brand
        );

      const normalizedModel =
        nullableText(
          model
        );

      await client.query(
        'BEGIN'
      );

      // ---------------------------------------------
      // CHECK CATEGORY
      // ---------------------------------------------

      const category =
        await client.query(
          `
          SELECT
            category_id

          FROM categories

          WHERE
            category_id = $1
          `,
          [
            Number(
              categoryId
            ),
          ]
        );

      if (
        !category.rows.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            error:
              'categoryId does not exist.',
          });
      }

      // ---------------------------------------------
      // CHECK LOCATION
      // ---------------------------------------------

      if (
        normalizedLocationId !==
        null
      ) {
        const location =
          await client.query(
            `
            SELECT
              location_id

            FROM locations

            WHERE
              location_id = $1
            `,
            [
              normalizedLocationId,
            ]
          );

        if (
          !location.rows.length
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res
            .status(400)
            .json({
              error:
                'locationId does not exist.',
            });
        }
      }

      // ---------------------------------------------
      // CHECK CUSTODIAN
      // ---------------------------------------------

      if (
        normalizedCustodianId !==
        null
      ) {
        const validation =
          await validateCustodian(
            client,
            normalizedCustodianId
          );

        if (
          !validation.valid
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res
            .status(400)
            .json({
              error:
                validation.error,
            });
        }
      }

      // ---------------------------------------------
      // CREATE QR
      // ---------------------------------------------

      const finalQrCodeUrl =
        String(
          qrCodeUrl ||
            `ams://asset/${randomUUID()}`
        ).trim();

      const qrResult =
        await client.query(
          `
          INSERT INTO asset_qr (
            qr_code_url,
            created_by,
            updated_by
          )

          VALUES (
            $1,
            $2,
            $2
          )

          RETURNING
            qr_id
          `,
          [
            finalQrCodeUrl,
            req.user.userId,
          ]
        );

      const qrId =
        qrResult.rows[0]
          .qr_id;

      // ---------------------------------------------
      // CREATE ASSET
      // ---------------------------------------------

      const assetResult =
        await client.query(
          `
          INSERT INTO assets (
            asset_name,
            qr_id,
            category_id,

            custodian_user_id,

            serial_no,
            brand,
            model,

            purchase_date,

            asset_image_url,

            status,

            created_by,
            updated_by
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $11
          )

          RETURNING
            asset_id
          `,
          [
            String(
              assetName
            ).trim(),

            qrId,

            Number(
              categoryId
            ),

            normalizedCustodianId,

            normalizedSerialNo,

            normalizedBrand,

            normalizedModel,

            normalizedPurchaseDate,

            normalizedImageUrl,

            Number(
              status
            ),

            req.user.userId,
          ]
        );

      const assetId =
        assetResult.rows[0]
          .asset_id;

      // ---------------------------------------------
      // INITIAL MAINTENANCE RECORD
      // ---------------------------------------------

      const maintenanceResult =
        await client.query(
          `
          INSERT INTO maintenance (
            asset_id,
            condition,
            repair_status,
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

          RETURNING
            maintenance_id
          `,
          [
            assetId,

            Number(
              condition
            ),

            Number(
              repairStatus
            ),

            req.user.userId,
          ]
        );

      // ---------------------------------------------
      // INITIAL LOCATION
      // ---------------------------------------------

      let transferId =
        null;

      if (
        normalizedLocationId !==
        null
      ) {
        const transferResult =
          await client.query(
            `
            INSERT INTO asset_transfer (
              user_id,
              asset_id,
              from_location_id,
              to_location_id,
              reason,
              created_by,
              updated_by
            )

            VALUES (
              $1,
              $2,
              NULL,
              $3,
              $4,
              $1,
              $1
            )

            RETURNING
              asset_transfer_id
            `,
            [
              req.user.userId,

              assetId,

              normalizedLocationId,

              transferReason,
            ]
          );

        transferId =
          transferResult
            .rows[0]
            .asset_transfer_id;
      }

      // ---------------------------------------------
      // AUDIT LOGS
      // ---------------------------------------------

      await writeAudit(
        client,
        req.user.userId,
        'asset_qr',
        qrId,
        AUDIT_ACTION.CREATE
      );

      await writeAudit(
        client,
        req.user.userId,
        'assets',
        assetId,
        AUDIT_ACTION.CREATE
      );

      await writeAudit(
        client,
        req.user.userId,
        'maintenance',
        maintenanceResult
          .rows[0]
          .maintenance_id,
        AUDIT_ACTION.CREATE
      );

      if (transferId) {
        await writeAudit(
          client,
          req.user.userId,
          'asset_transfer',
          transferId,
          AUDIT_ACTION.CREATE
        );
      }

      await client.query(
        'COMMIT'
      );

      // ---------------------------------------------
      // RETURN CREATED ASSET
      // ---------------------------------------------

      const { rows } =
        await pool.query(
          `
          ${ASSET_SELECT}

          WHERE
            a.asset_id = $1
          `,
          [assetId]
        );

      res
        .status(201)
        .json(
          addAssetLabels(
            rows[0]
          )
        );
    } catch (err) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {
        // Ignore rollback error
      }

      if (
        err.code === '23505'
      ) {
        return res
          .status(409)
          .json({
            error:
              'The QR code or another unique asset value already exists.',
          });
      }

      if (
        err.code === '23503'
      ) {
        return res
          .status(400)
          .json({
            error:
              'A referenced category, custodian, or location does not exist.',
          });
      }

      if (
        err.code === '22007' ||
        err.code === '22008'
      ) {
        return res
          .status(400)
          .json({
            error:
              'purchaseDate is invalid. Use YYYY-MM-DD.',
          });
      }

      console.error(
        'Create asset error:',
        err
      );

      res
        .status(500)
        .json({
          error:
            'Failed to create asset.',
        });
    } finally {
      client.release();
    }
  }
);

// ==========================================================
// UPDATE ASSET
// PATCH /api/assets/:id
// ==========================================================

router.patch(
  '/:id',
  requireAuth,
  requirePermission('Assets', 3),

  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const fields = [];
      const values = [];

      let i = 1;

      const add = (
        column,
        value
      ) => {
        if (
          value !==
          undefined
        ) {
          fields.push(
            `${column} = $${i++}`
          );

          values.push(
            value
          );
        }
      };

      // ---------------------------------------------
      // VALIDATE STATUS
      // ---------------------------------------------

      if (
        req.body.status !==
          undefined &&
        !isIntIn(
          req.body.status,
          [0, 1]
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'status must be 0 or 1.',
          });
      }

      // ---------------------------------------------
      // VALIDATE CUSTODIAN ID
      // ---------------------------------------------

      const normalizedCustodianId =
        nullableInteger(
          req.body
            .custodianUserId
        );

      if (
        Number.isNaN(
          normalizedCustodianId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'custodianUserId must be an integer or null.',
          });
      }

      // ---------------------------------------------
      // BUILD UPDATE
      // ---------------------------------------------

      add(
        'asset_name',
        req.body.assetName ===
          undefined
          ? undefined
          : String(
              req.body
                .assetName
            ).trim()
      );

      add(
        'category_id',
        req.body.categoryId
      );

      add(
        'custodian_user_id',
        normalizedCustodianId
      );

      add(
        'serial_no',
        nullableText(
          req.body.serialNo
        )
      );

      add(
        'brand',
        nullableText(
          req.body.brand
        )
      );

      add(
        'model',
        nullableText(
          req.body.model
        )
      );

      add(
        'purchase_date',
        nullableText(
          req.body.purchaseDate
        )
      );

      add(
        'asset_image_url',
        nullableText(
          req.body.assetImageUrl
        )
      );

      add(
        'status',
        req.body.status ===
          undefined
          ? undefined
          : Number(
              req.body.status
            )
      );

      const changingQr =
        req.body.qrCodeUrl !==
        undefined;

      if (
        !fields.length &&
        !changingQr
      ) {
        return res
          .status(400)
          .json({
            error:
              'No asset fields provided.',
          });
      }

      await client.query(
        'BEGIN'
      );

      // ---------------------------------------------
      // CHECK ASSET EXISTS
      // ---------------------------------------------

      const existing =
        await client.query(
          `
          SELECT
            asset_id,
            qr_id

          FROM assets

          WHERE
            asset_id = $1

          FOR UPDATE
          `,
          [req.params.id]
        );

      if (
        !existing.rows.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(404)
          .json({
            error:
              'Asset not found.',
          });
      }

      // ---------------------------------------------
      // CHECK CUSTODIAN
      // Only validate if a non-null custodian is supplied.
      // null means "Unassigned".
      // ---------------------------------------------

      if (
        req.body
          .custodianUserId !==
          undefined &&
        normalizedCustodianId !==
          null
      ) {
        const validation =
          await validateCustodian(
            client,
            normalizedCustodianId
          );

        if (
          !validation.valid
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res
            .status(400)
            .json({
              error:
                validation.error,
            });
        }
      }

      // ---------------------------------------------
      // UPDATE ASSET
      // ---------------------------------------------

      if (fields.length) {
        fields.push(
          'updated_at = NOW()'
        );

        fields.push(
          `updated_by = $${i++}`
        );

        values.push(
          req.user.userId
        );

        values.push(
          req.params.id
        );

        await client.query(
          `
          UPDATE assets

          SET
            ${fields.join(
              ', '
            )}

          WHERE
            asset_id = $${i}
          `,
          values
        );
      }

      // ---------------------------------------------
      // UPDATE QR
      // ---------------------------------------------

      if (changingQr) {
        const newQrCode =
          String(
            req.body
              .qrCodeUrl || ''
          ).trim();

        if (!newQrCode) {
          await client.query(
            'ROLLBACK'
          );

          return res
            .status(400)
            .json({
              error:
                'qrCodeUrl cannot be empty.',
            });
        }

        await client.query(
          `
          UPDATE asset_qr

          SET
            qr_code_url = $1,
            updated_at = NOW(),
            updated_by = $2

          WHERE
            qr_id = $3
          `,
          [
            newQrCode,

            req.user.userId,

            existing.rows[0]
              .qr_id,
          ]
        );

        await writeAudit(
          client,
          req.user.userId,
          'asset_qr',
          existing.rows[0]
            .qr_id,
          AUDIT_ACTION.UPDATE
        );
      }

      // ---------------------------------------------
      // AUDIT
      // ---------------------------------------------

      if (fields.length) {
        await writeAudit(
          client,
          req.user.userId,
          'assets',
          Number(
            req.params.id
          ),
          AUDIT_ACTION.UPDATE
        );
      }

      await client.query(
        'COMMIT'
      );

      // ---------------------------------------------
      // RETURN UPDATED ASSET
      // ---------------------------------------------

      const { rows } =
        await pool.query(
          `
          ${ASSET_SELECT}

          WHERE
            a.asset_id = $1
          `,
          [req.params.id]
        );

      res.json(
        addAssetLabels(
          rows[0]
        )
      );
    } catch (err) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {
        // Ignore rollback error
      }

      if (
        err.code === '23503'
      ) {
        return res
          .status(400)
          .json({
            error:
              'Referenced category or custodian does not exist.',
          });
      }

      if (
        err.code === '23505'
      ) {
        return res
          .status(409)
          .json({
            error:
              'QR code already exists.',
          });
      }

      if (
        err.code === '22007' ||
        err.code === '22008'
      ) {
        return res
          .status(400)
          .json({
            error:
              'purchaseDate is invalid. Use YYYY-MM-DD.',
          });
      }

      console.error(
        'Update asset error:',
        err
      );

      res
        .status(500)
        .json({
          error:
            'Failed to update asset.',
        });
    } finally {
      client.release();
    }
  }
);

// ==========================================================
// DEACTIVATE ASSET
// DELETE /api/assets/:id
//
// This is a soft delete.
// The asset remains in the database,
// but status becomes 0 = Inactive.
// ==========================================================

router.delete(
  '/:id',
  requireAuth,
  requirePermission('Assets', 4),

  async (req, res) => {
    try {
      const { rows } =
        await pool.query(
          `
          UPDATE assets

          SET
            status = 0,
            updated_at = NOW(),
            updated_by = $1

          WHERE
            asset_id = $2

          RETURNING
            asset_id
          `,
          [
            req.user.userId,
            req.params.id,
          ]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Asset not found.',
          });
      }

      await writeAudit(
        pool,
        req.user.userId,
        'assets',
        Number(
          req.params.id
        ),
        AUDIT_ACTION.DELETE
      );

      res.json({
        message:
          'Asset marked inactive.',

        assetId: Number(
          req.params.id
        ),
      });
    } catch (err) {
      console.error(
        'Deactivate asset error:',
        err
      );

      res
        .status(500)
        .json({
          error:
            'Failed to deactivate asset.',
        });
    }
  }
);

module.exports = router;