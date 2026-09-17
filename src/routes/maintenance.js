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

const {
  CONDITION,
  REPAIR_STATUS,
} = require('../utils/labels');

const router = express.Router();


// ======================================================
// HELPERS
// ======================================================

function serialize(row) {
  return {
    ...row,

    conditionLabel:
      CONDITION[row.condition] ??
      'Unknown',

    repairStatusLabel:
      REPAIR_STATUS[
        row.repairStatus
      ] ?? 'Unknown',
  };
}


function valid0to2(value) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number >= 0 &&
    number <= 2
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
// SHARED SELECT
// ======================================================

const MAINTENANCE_SELECT = `
  SELECT
    m.maintenance_id
      AS "maintenanceId",

    m.asset_id
      AS "assetId",

    a.asset_name
      AS "assetName",

    m.condition,

    m.repair_status
      AS "repairStatus",

    m.created_at
      AS "createdAt",

    m.updated_at
      AS "updatedAt"

  FROM maintenance m

  JOIN assets a
    ON a.asset_id =
      m.asset_id
`;


// ======================================================
// GET ALL MAINTENANCE RECORDS
//
// Optional:
// GET /api/maintenance?assetId=2
// ======================================================

router.get(
  '/',
  requireAuth,
  requirePermission(
    'Maintenance',
    2
  ),
  async (req, res) => {
    try {
      const values = [];

      let where = '';

      if (
        req.query.assetId !==
        undefined
      ) {
        const assetId =
          Number(
            req.query.assetId
          );

        if (
          !positiveInteger(
            assetId
          )
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
          'WHERE m.asset_id = $1';
      }


      const { rows } =
        await pool.query(
          `
          ${MAINTENANCE_SELECT}

          ${where}

          ORDER BY
            m.created_at DESC,
            m.maintenance_id DESC
          `,
          values
        );


      return res.json(
        rows.map(serialize)
      );

    } catch (err) {
      console.error(
        'Fetch maintenance error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve maintenance records.',
        });
    }
  }
);


// ======================================================
// GET MAINTENANCE HISTORY FOR ONE ASSET
// ======================================================

router.get(
  '/asset/:assetId',
  requireAuth,
  requirePermission(
    'Maintenance',
    2
  ),
  async (req, res) => {
    try {
      const assetId =
        Number(
          req.params.assetId
        );


      if (
        !positiveInteger(
          assetId
        )
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
            asset_name,
            status

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
          ${MAINTENANCE_SELECT}

          WHERE m.asset_id = $1

          ORDER BY
            m.created_at DESC,
            m.maintenance_id DESC
          `,
          [assetId]
        );


      const history =
        rows.map(serialize);


      return res.json({
        assetId,

        assetName:
          asset.rows[0]
            .asset_name,

        assetStatus:
          asset.rows[0]
            .status,

        current:
          history[0] ||
          null,

        history,
      });

    } catch (err) {
      console.error(
        'Fetch asset maintenance history error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve asset maintenance history.',
        });
    }
  }
);


// ======================================================
// GET ONE MAINTENANCE RECORD
// ======================================================

router.get(
  '/:id',
  requireAuth,
  requirePermission(
    'Maintenance',
    2
  ),
  async (req, res) => {
    try {
      const maintenanceId =
        Number(
          req.params.id
        );


      if (
        !positiveInteger(
          maintenanceId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'Maintenance id must be a positive integer.',
          });
      }


      const { rows } =
        await pool.query(
          `
          ${MAINTENANCE_SELECT}

          WHERE
            m.maintenance_id = $1
          `,
          [maintenanceId]
        );


      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Maintenance record not found.',
          });
      }


      return res.json(
        serialize(rows[0])
      );

    } catch (err) {
      console.error(
        'Fetch maintenance record error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve maintenance record.',
        });
    }
  }
);


// ======================================================
// CREATE MAINTENANCE RECORD
// ======================================================

router.post(
  '/',
  requireAuth,
  requirePermission(
    'Maintenance',
    1
  ),
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const assetId =
        Number(
          req.body.assetId
        );

      const condition =
        Number(
          req.body.condition
        );

      const repairStatus =
        req.body
          .repairStatus ===
        undefined
          ? 0
          : Number(
              req.body
                .repairStatus
            );


      if (
        !positiveInteger(
          assetId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'assetId must be a positive integer.',
          });
      }


      if (
        !valid0to2(
          condition
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'condition must be 0, 1, or 2.',
          });
      }


      if (
        !valid0to2(
          repairStatus
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'repairStatus must be 0, 1, or 2.',
          });
      }


      await client.query(
        'BEGIN'
      );


      // Only active assets can receive
      // new maintenance updates.

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


      const { rows } =
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
              AS "maintenanceId",

            asset_id
              AS "assetId",

            condition,

            repair_status
              AS "repairStatus",

            created_at
              AS "createdAt",

            updated_at
              AS "updatedAt"
          `,
          [
            assetId,
            condition,
            repairStatus,
            req.user.userId,
          ]
        );


      await writeAudit(
        client,
        req.user.userId,
        'maintenance',
        rows[0]
          .maintenanceId,
        AUDIT_ACTION.CREATE
      );


      await client.query(
        'COMMIT'
      );


      return res
        .status(201)
        .json(
          serialize({
            ...rows[0],

            assetName:
              asset.rows[0]
                .asset_name,
          })
        );

    } catch (err) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {
        // Ignore rollback failure
      }


      console.error(
        'Create maintenance error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to create maintenance record.',
        });

    } finally {
      client.release();
    }
  }
);


// ======================================================
// UPDATE MAINTENANCE RECORD
//
// Used for correcting an existing record.
// ======================================================

router.patch(
  '/:id',
  requireAuth,
  requirePermission(
    'Maintenance',
    3
  ),
  async (req, res) => {
    try {
      const maintenanceId =
        Number(
          req.params.id
        );


      if (
        !positiveInteger(
          maintenanceId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'Maintenance id must be a positive integer.',
          });
      }


      const fields = [];
      const values = [];

      let i = 1;


      if (
        req.body.condition !==
        undefined
      ) {
        if (
          !valid0to2(
            req.body.condition
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'condition must be 0, 1, or 2.',
            });
        }


        fields.push(
          `condition = $${i++}`
        );

        values.push(
          Number(
            req.body.condition
          )
        );
      }


      if (
        req.body
          .repairStatus !==
        undefined
      ) {
        if (
          !valid0to2(
            req.body
              .repairStatus
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'repairStatus must be 0, 1, or 2.',
            });
        }


        fields.push(
          `repair_status = $${i++}`
        );

        values.push(
          Number(
            req.body
              .repairStatus
          )
        );
      }


      if (!fields.length) {
        return res
          .status(400)
          .json({
            error:
              'No maintenance fields provided.',
          });
      }


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
        maintenanceId
      );


      const { rows } =
        await pool.query(
          `
          UPDATE maintenance

          SET
            ${fields.join(', ')}

          WHERE
            maintenance_id =
              $${i}

          RETURNING
            maintenance_id
              AS "maintenanceId",

            asset_id
              AS "assetId",

            condition,

            repair_status
              AS "repairStatus",

            created_at
              AS "createdAt",

            updated_at
              AS "updatedAt"
          `,
          values
        );


      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Maintenance record not found.',
          });
      }


      await writeAudit(
        pool,
        req.user.userId,
        'maintenance',
        maintenanceId,
        AUDIT_ACTION.UPDATE
      );


      return res.json(
        serialize(rows[0])
      );

    } catch (err) {
      console.error(
        'Update maintenance error:',
        err
      );


      return res
        .status(500)
        .json({
          error:
            'Failed to update maintenance record.',
        });
    }
  }
);


module.exports = router;