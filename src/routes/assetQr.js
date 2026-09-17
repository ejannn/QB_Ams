const express = require('express');
const { randomUUID } = require('crypto');

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
// HELPERS
// ======================================================

function positiveInteger(value) {
  const number = Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  );
}


function validBoolean(value) {
  return typeof value === 'boolean';
}


// ======================================================
// SHARED SELECT
// ======================================================

const QR_SELECT = `
  SELECT
    q.qr_id
      AS "qrId",

    q.qr_code_url
      AS "qrCodeUrl",

    q.is_active
      AS "isActive",

    q.is_printed
      AS "isPrinted",

    q.created_at
      AS "createdAt",

    q.updated_at
      AS "updatedAt",

    a.asset_id
      AS "assetId",

    a.asset_name
      AS "assetName"

  FROM asset_qr q

  LEFT JOIN assets a
    ON a.qr_id = q.qr_id
`;


// ======================================================
// GET ALL QR RECORDS
// ======================================================

router.get(
  '/',
  requireAuth,
  requirePermission('Asset QR', 2),
  async (req, res) => {
    try {
      const { rows } =
        await pool.query(
          `
          ${QR_SELECT}

          ORDER BY q.qr_id DESC
          `
        );

      return res.json(rows);

    } catch (err) {
      console.error(
        'Fetch QR error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve QR records.',
        });
    }
  }
);


// ======================================================
// GET ONE QR RECORD
// ======================================================

router.get(
  '/:id',
  requireAuth,
  requirePermission('Asset QR', 2),
  async (req, res) => {
    try {
      const qrId =
        Number(req.params.id);

      if (!positiveInteger(qrId)) {
        return res
          .status(400)
          .json({
            error:
              'QR id must be a positive integer.',
          });
      }

      const { rows } =
        await pool.query(
          `
          ${QR_SELECT}

          WHERE q.qr_id = $1
          `,
          [qrId]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'QR record not found.',
          });
      }

      return res.json(rows[0]);

    } catch (err) {
      console.error(
        'Fetch QR record error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve QR record.',
        });
    }
  }
);


// ======================================================
// CREATE QR RECORD
// ======================================================

router.post(
  '/',
  requireAuth,
  requirePermission('Asset QR', 1),
  async (req, res) => {
    try {
      const qrCodeUrl =
        String(
          req.body.qrCodeUrl ||
          `ams://asset/${randomUUID()}`
        ).trim();

      if (!qrCodeUrl) {
        return res
          .status(400)
          .json({
            error:
              'QR code URL is required.',
          });
      }

      if (qrCodeUrl.length > 500) {
        return res
          .status(400)
          .json({
            error:
              'QR code URL must not exceed 500 characters.',
          });
      }

      const { rows } =
        await pool.query(
          `
          INSERT INTO asset_qr (
            qr_code_url,
            created_by,
            updated_by
          )
          VALUES ($1, $2, $2)

          RETURNING
            qr_id AS "qrId",
            qr_code_url AS "qrCodeUrl",
            is_active AS "isActive",
            is_printed AS "isPrinted",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          `,
          [
            qrCodeUrl,
            req.user.userId,
          ]
        );

      await writeAudit(
        pool,
        req.user.userId,
        'asset_qr',
        rows[0].qrId,
        AUDIT_ACTION.CREATE
      );

      return res
        .status(201)
        .json({
          ...rows[0],
          assetId: null,
          assetName: null,
        });

    } catch (err) {
      if (err.code === '23505') {
        return res
          .status(409)
          .json({
            error:
              'QR code already exists.',
          });
      }

      console.error(
        'Create QR error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to create QR record.',
        });
    }
  }
);


// ======================================================
// UPDATE QR
//
// Supports:
// qrCodeUrl
// isActive
// isPrinted
// ======================================================

router.patch(
  '/:id',
  requireAuth,
  requirePermission('Asset QR', 3),
  async (req, res) => {
    try {
      const qrId =
        Number(req.params.id);

      if (!positiveInteger(qrId)) {
        return res
          .status(400)
          .json({
            error:
              'QR id must be a positive integer.',
          });
      }

      const fields = [];
      const values = [];

      let index = 1;


      // QR CODE URL

      if (
        req.body.qrCodeUrl !==
        undefined
      ) {
        const qrCodeUrl =
          String(
            req.body.qrCodeUrl
          ).trim();

        if (!qrCodeUrl) {
          return res
            .status(400)
            .json({
              error:
                'QR code URL cannot be empty.',
            });
        }

        if (
          qrCodeUrl.length >
          500
        ) {
          return res
            .status(400)
            .json({
              error:
                'QR code URL must not exceed 500 characters.',
            });
        }

        fields.push(
          `qr_code_url = $${index++}`
        );

        values.push(
          qrCodeUrl
        );
      }


      // ACTIVE STATUS

      if (
        req.body.isActive !==
        undefined
      ) {
        if (
          !validBoolean(
            req.body.isActive
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'isActive must be a boolean.',
            });
        }

        fields.push(
          `is_active = $${index++}`
        );

        values.push(
          req.body.isActive
        );
      }


      // PRINT STATUS

      if (
        req.body.isPrinted !==
        undefined
      ) {
        if (
          !validBoolean(
            req.body.isPrinted
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'isPrinted must be a boolean.',
            });
        }

        fields.push(
          `is_printed = $${index++}`
        );

        values.push(
          req.body.isPrinted
        );
      }


      if (!fields.length) {
        return res
          .status(400)
          .json({
            error:
              'No QR fields provided.',
          });
      }


      fields.push(
        'updated_at = NOW()'
      );

      fields.push(
        `updated_by = $${index++}`
      );

      values.push(
        req.user.userId
      );

      values.push(qrId);


      const { rows } =
        await pool.query(
          `
          UPDATE asset_qr

          SET
            ${fields.join(', ')}

          WHERE
            qr_id =
              $${index}

          RETURNING
            qr_id AS "qrId",
            qr_code_url AS "qrCodeUrl",
            is_active AS "isActive",
            is_printed AS "isPrinted",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          `,
          values
        );


      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'QR record not found.',
          });
      }


      await writeAudit(
        pool,
        req.user.userId,
        'asset_qr',
        qrId,
        AUDIT_ACTION.UPDATE
      );


      return res.json(
        rows[0]
      );

    } catch (err) {
      if (err.code === '23505') {
        return res
          .status(409)
          .json({
            error:
              'QR code already exists.',
          });
      }

      console.error(
        'Update QR error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to update QR record.',
        });
    }
  }
);


module.exports = router;