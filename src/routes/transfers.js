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
// SHARED SELECT
// ======================================================

const TRANSFER_SELECT = `
  SELECT
    t.asset_transfer_id AS "assetTransferId",

    t.user_id AS "userId",

    t.asset_id AS "assetId",

    a.asset_name AS "assetName",

    q.qr_code_url AS "qrCodeUrl",

    t.from_location_id AS "fromLocationId",

    fl.name AS "fromLocationName",

    t.to_location_id AS "toLocationId",

    tl.name AS "toLocationName",

    t.reason,

    t.created_at AS "createdAt",

    CONCAT_WS(
      ' ',
      d.first_name,
      d.middle_name,
      d.last_name,
      d.extension
    ) AS "handledBy"

  FROM asset_transfer t

  JOIN assets a
    ON a.asset_id =
      t.asset_id

  JOIN asset_qr q
    ON q.qr_id =
      a.qr_id

  LEFT JOIN locations fl
    ON fl.location_id =
      t.from_location_id

  JOIN locations tl
    ON tl.location_id =
      t.to_location_id

  LEFT JOIN user_details d
    ON d.user_id =
      t.user_id
`;


// ======================================================
// GET ALL TRANSFERS
//
// Optional:
// GET /api/transfers?assetId=2
// ======================================================

router.get(
  '/',
  requireAuth,
  requirePermission('Transfers', 2),
  async (req, res) => {
    try {
      const values = [];

      let where = '';

      if (
        req.query.assetId !== undefined
      ) {
        const assetId =
          Number(req.query.assetId);

        if (
          !Number.isInteger(assetId) ||
          assetId <= 0
        ) {
          return res
            .status(400)
            .json({
              error:
                'assetId must be a positive integer.',
            });
        }

        values.push(assetId);

        where =
          'WHERE t.asset_id = $1';
      }

      const { rows } =
        await pool.query(
          `
          ${TRANSFER_SELECT}

          ${where}

          ORDER BY
            t.created_at DESC,
            t.asset_transfer_id DESC
          `,
          values
        );

      return res.json(rows);

    } catch (err) {
      console.error(
        'Fetch transfers error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve transfers.',
        });
    }
  }
);


// ======================================================
// GET TRANSFER HISTORY FOR ONE ASSET
// ======================================================

router.get(
  '/asset/:assetId',
  requireAuth,
  requirePermission('Transfers', 2),
  async (req, res) => {
    try {
      const assetId =
        Number(
          req.params.assetId
        );

      if (
        !Number.isInteger(assetId) ||
        assetId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'assetId must be a positive integer.',
          });
      }

      const asset =
        await pool.query(
          `
          SELECT
            asset_id,
            asset_name

          FROM assets

          WHERE asset_id = $1
          `,
          [assetId]
        );

      if (!asset.rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Asset not found.',
          });
      }

      const { rows } =
        await pool.query(
          `
          ${TRANSFER_SELECT}

          WHERE t.asset_id = $1

          ORDER BY
            t.created_at DESC,
            t.asset_transfer_id DESC
          `,
          [assetId]
        );

      const currentLocation =
        rows.length
          ? {
              locationId:
                rows[0].toLocationId,

              locationName:
                rows[0].toLocationName,
            }
          : null;

      return res.json({
        assetId,

        assetName:
          asset.rows[0]
            .asset_name,

        currentLocation,

        history: rows,
      });

    } catch (err) {
      console.error(
        'Fetch asset transfer history error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve asset transfer history.',
        });
    }
  }
);


// ======================================================
// CREATE TRANSFER
// ======================================================

router.post(
  '/',
  requireAuth,
  requirePermission('Transfers', 1),
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const assetId =
        Number(
          req.body.assetId
        );

      const toLocationId =
        Number(
          req.body.toLocationId
        );

      const reason =
        String(
          req.body.reason || ''
        ).trim();


      if (
        !Number.isInteger(assetId) ||
        assetId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'assetId must be a positive integer.',
          });
      }


      if (
        !Number.isInteger(
          toLocationId
        ) ||
        toLocationId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'toLocationId must be a positive integer.',
          });
      }


      if (reason.length > 500) {
        return res
          .status(400)
          .json({
            error:
              'Transfer reason must not exceed 500 characters.',
          });
      }


      await client.query(
        'BEGIN'
      );


      // Lock the asset so two transfers
      // cannot happen simultaneously.
      const asset =
        await client.query(
          `
          SELECT
            asset_id,
            asset_name

          FROM assets

          WHERE
            asset_id = $1
            AND status = 1

          FOR UPDATE
          `,
          [assetId]
        );


      if (!asset.rows.length) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(404)
          .json({
            error:
              'Active asset not found.',
          });
      }


      const location =
        await client.query(
          `
          SELECT
            location_id,
            name

          FROM locations

          WHERE location_id = $1
          `,
          [toLocationId]
        );


      if (!location.rows.length) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(400)
          .json({
            error:
              'toLocationId does not exist.',
          });
      }


      const previous =
        await client.query(
          `
          SELECT
            to_location_id

          FROM asset_transfer

          WHERE asset_id = $1

          ORDER BY
            created_at DESC,
            asset_transfer_id DESC

          LIMIT 1

          FOR UPDATE
          `,
          [assetId]
        );


      const fromLocationId =
        previous.rows.length
          ? previous.rows[0]
              .to_location_id
          : null;


      if (
        fromLocationId !== null &&
        Number(fromLocationId) ===
          toLocationId
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res
          .status(409)
          .json({
            error:
              'Asset is already in that location.',
          });
      }


      const insert =
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
            $3,
            $4,
            $5,
            $1,
            $1
          )

          RETURNING
            asset_transfer_id
              AS "assetTransferId",

            user_id
              AS "userId",

            asset_id
              AS "assetId",

            from_location_id
              AS "fromLocationId",

            to_location_id
              AS "toLocationId",

            reason,

            created_at
              AS "createdAt"
          `,
          [
            req.user.userId,
            assetId,
            fromLocationId,
            toLocationId,
            reason || null,
          ]
        );


      const transfer =
        insert.rows[0];


      await writeAudit(
        client,
        req.user.userId,
        'asset_transfer',
        transfer.assetTransferId,
        AUDIT_ACTION.CREATE
      );


      await client.query(
        'COMMIT'
      );


      return res
        .status(201)
        .json({
          ...transfer,

          assetName:
            asset.rows[0]
              .asset_name,

          fromLocationName:
            previous.rows.length
              ? null
              : null,

          toLocationName:
            location.rows[0]
              .name,
        });

    } catch (err) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {
        // Ignore rollback failure
      }

      console.error(
        'Create transfer error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to transfer asset.',
        });

    } finally {
      client.release();
    }
  }
);


module.exports = router;