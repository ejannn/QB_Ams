const express = require('express');

const pool =
  require('../db/pool');

const requireAuth =
  require('../middleware/requireAuth');

const requirePermission =
  require('../middleware/requirePermission');

const {
  CONDITION,
  REPAIR_STATUS,
} = require('../utils/labels');


const router = express.Router();


// ======================================================
// HELPERS
// ======================================================

function positiveInteger(value) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  );
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


function validStatus(value) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    (number === 0 ||
      number === 1)
  );
}


function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/
    .test(String(value));
}


function assetLabels(row) {
  return {
    ...row,

    statusLabel:
      row.status === 1
        ? 'Active'
        : 'Inactive',

    conditionLabel:
      row.condition === null
        ? null
        : CONDITION[
            row.condition
          ] ?? 'Unknown',

    repairStatusLabel:
      row.repairStatus === null
        ? null
        : REPAIR_STATUS[
            row.repairStatus
          ] ?? 'Unknown',
  };
}


function maintenanceLabels(row) {
  return {
    ...row,

    conditionLabel:
      CONDITION[
        row.condition
      ] ?? 'Unknown',

    repairStatusLabel:
      REPAIR_STATUS[
        row.repairStatus
      ] ?? 'Unknown',
  };
}


// ======================================================
// ASSET INVENTORY REPORT
//
// /api/reports/assets
//
// Optional:
// ?status=1
// ?categoryId=1
// ?locationId=2
// ?condition=1
// ?repairStatus=0
// ?search=HP
// ======================================================

router.get(
  '/assets',
  requireAuth,
  requirePermission('Reports', 2),
  async (req, res) => {

    try {

      const conditions = [];
      const values = [];

      let index = 1;


      if (
        req.query.status !==
        undefined
      ) {

        if (
          !validStatus(
            req.query.status
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'status must be 0 or 1.',
            });
        }

        conditions.push(
          `a.status = $${index++}`
        );

        values.push(
          Number(
            req.query.status
          )
        );
      }


      if (
        req.query.categoryId !==
        undefined
      ) {

        if (
          !positiveInteger(
            req.query.categoryId
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'categoryId must be a positive integer.',
            });
        }

        conditions.push(
          `a.category_id = $${index++}`
        );

        values.push(
          Number(
            req.query.categoryId
          )
        );
      }


      if (
        req.query.locationId !==
        undefined
      ) {

        if (
          !positiveInteger(
            req.query.locationId
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'locationId must be a positive integer.',
            });
        }

        conditions.push(
          `lt.to_location_id = $${index++}`
        );

        values.push(
          Number(
            req.query.locationId
          )
        );
      }


      if (
        req.query.condition !==
        undefined
      ) {

        if (
          !valid0to2(
            req.query.condition
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'condition must be 0, 1, or 2.',
            });
        }

        conditions.push(
          `lm.condition = $${index++}`
        );

        values.push(
          Number(
            req.query.condition
          )
        );
      }


      if (
        req.query.repairStatus !==
        undefined
      ) {

        if (
          !valid0to2(
            req.query.repairStatus
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'repairStatus must be 0, 1, or 2.',
            });
        }

        conditions.push(
          `lm.repair_status = $${index++}`
        );

        values.push(
          Number(
            req.query.repairStatus
          )
        );
      }


      if (req.query.search) {

        const search =
          String(
            req.query.search
          ).trim();

        conditions.push(`
          (
            a.asset_name
              ILIKE $${index}

            OR a.serial_no
              ILIKE $${index}

            OR a.brand
              ILIKE $${index}

            OR a.model
              ILIKE $${index}
          )
        `);

        values.push(
          `%${search}%`
        );

        index++;
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
          SELECT
            a.asset_id
              AS "assetId",

            a.asset_name
              AS "assetName",

            a.serial_no
              AS "serialNo",

            a.brand,

            a.model,

            TO_CHAR(
              a.purchase_date,
              'YYYY-MM-DD'
            ) AS "purchaseDate",

            a.status,

            c.category_id
              AS "categoryId",

            c.name
              AS "categoryName",

            q.qr_code_url
              AS "qrCodeUrl",

            q.is_active
              AS "qrIsActive",

            q.is_printed
              AS "qrIsPrinted",

            lt.to_location_id
              AS "currentLocationId",

            l.name
              AS "currentLocationName",

            lm.condition,

            lm.repair_status
              AS "repairStatus",

            ac.custodian_user_id
              AS "custodianUserId",

            CONCAT_WS(
              ' ',
              ud.first_name,
              ud.middle_name,
              ud.last_name,
              ud.extension
            ) AS "custodianName"

          FROM assets a

          JOIN categories c
            ON c.category_id =
              a.category_id

          JOIN asset_qr q
            ON q.qr_id =
              a.qr_id


          LEFT JOIN LATERAL (
            SELECT
              to_location_id

            FROM asset_transfer t

            WHERE
              t.asset_id =
                a.asset_id

            ORDER BY
              t.created_at DESC,
              t.asset_transfer_id DESC

            LIMIT 1
          ) lt ON TRUE


          LEFT JOIN locations l
            ON l.location_id =
              lt.to_location_id


          LEFT JOIN LATERAL (
            SELECT
              condition,
              repair_status

            FROM maintenance m

            WHERE
              m.asset_id =
                a.asset_id

            ORDER BY
              m.created_at DESC,
              m.maintenance_id DESC

            LIMIT 1
          ) lm ON TRUE


          LEFT JOIN asset_custody ac
            ON ac.asset_id =
              a.asset_id
            AND ac.returned_at
              IS NULL


          LEFT JOIN user_details ud
            ON ud.user_id =
              ac.custodian_user_id


          ${where}


          ORDER BY
            a.asset_name,
            a.asset_id
          `,
          values
        );


      return res.json({
        count:
          rows.length,

        rows:
          rows.map(
            assetLabels
          ),
      });

    } catch (err) {

      console.error(
        'Asset report error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to generate asset report.',
        });
    }
  }
);


// ======================================================
// TRANSFER REPORT
// ======================================================

router.get(
  '/transfers',
  requireAuth,
  requirePermission('Reports', 2),
  async (req, res) => {

    try {

      const conditions = [];
      const values = [];

      let index = 1;


      if (
        req.query.assetId !==
        undefined
      ) {

        if (
          !positiveInteger(
            req.query.assetId
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'assetId must be a positive integer.',
            });
        }

        conditions.push(
          `t.asset_id = $${index++}`
        );

        values.push(
          Number(
            req.query.assetId
          )
        );
      }


      if (req.query.dateFrom) {

        if (
          !validDate(
            req.query.dateFrom
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'dateFrom must use YYYY-MM-DD.',
            });
        }

        conditions.push(
          `t.created_at >= $${index++}::date`
        );

        values.push(
          req.query.dateFrom
        );
      }


      if (req.query.dateTo) {

        if (
          !validDate(
            req.query.dateTo
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'dateTo must use YYYY-MM-DD.',
            });
        }

        conditions.push(
          `t.created_at < ($${index++}::date + INTERVAL '1 day')`
        );

        values.push(
          req.query.dateTo
        );
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
          SELECT
            t.asset_transfer_id
              AS "assetTransferId",

            t.asset_id
              AS "assetId",

            a.asset_name
              AS "assetName",

            t.from_location_id
              AS "fromLocationId",

            fl.name
              AS "fromLocationName",

            t.to_location_id
              AS "toLocationId",

            tl.name
              AS "toLocationName",

            t.reason,

            t.user_id
              AS "handledByUserId",

            CONCAT_WS(
              ' ',
              ud.first_name,
              ud.middle_name,
              ud.last_name,
              ud.extension
            ) AS "handledBy",

            t.created_at
              AS "createdAt"

          FROM asset_transfer t

          JOIN assets a
            ON a.asset_id =
              t.asset_id

          LEFT JOIN locations fl
            ON fl.location_id =
              t.from_location_id

          JOIN locations tl
            ON tl.location_id =
              t.to_location_id

          LEFT JOIN user_details ud
            ON ud.user_id =
              t.user_id

          ${where}

          ORDER BY
            t.created_at DESC,
            t.asset_transfer_id DESC
          `,
          values
        );


      return res.json({
        count:
          rows.length,

        rows,
      });

    } catch (err) {

      console.error(
        'Transfer report error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to generate transfer report.',
        });
    }
  }
);


// ======================================================
// MAINTENANCE REPORT
// ======================================================

router.get(
  '/maintenance',
  requireAuth,
  requirePermission('Reports', 2),
  async (req, res) => {

    try {

      const conditions = [];
      const values = [];

      let index = 1;


      if (
        req.query.assetId !==
        undefined
      ) {

        if (
          !positiveInteger(
            req.query.assetId
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'assetId must be a positive integer.',
            });
        }

        conditions.push(
          `m.asset_id = $${index++}`
        );

        values.push(
          Number(
            req.query.assetId
          )
        );
      }


      if (
        req.query.condition !==
        undefined
      ) {

        if (
          !valid0to2(
            req.query.condition
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'condition must be 0, 1, or 2.',
            });
        }

        conditions.push(
          `m.condition = $${index++}`
        );

        values.push(
          Number(
            req.query.condition
          )
        );
      }


      if (
        req.query.repairStatus !==
        undefined
      ) {

        if (
          !valid0to2(
            req.query.repairStatus
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'repairStatus must be 0, 1, or 2.',
            });
        }

        conditions.push(
          `m.repair_status = $${index++}`
        );

        values.push(
          Number(
            req.query.repairStatus
          )
        );
      }


      if (req.query.dateFrom) {

        if (
          !validDate(
            req.query.dateFrom
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'dateFrom must use YYYY-MM-DD.',
            });
        }

        conditions.push(
          `m.created_at >= $${index++}::date`
        );

        values.push(
          req.query.dateFrom
        );
      }


      if (req.query.dateTo) {

        if (
          !validDate(
            req.query.dateTo
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'dateTo must use YYYY-MM-DD.',
            });
        }

        conditions.push(
          `m.created_at < ($${index++}::date + INTERVAL '1 day')`
        );

        values.push(
          req.query.dateTo
        );
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
          SELECT
            m.maintenance_id
              AS "maintenanceId",

            m.asset_id
              AS "assetId",

            a.asset_name
              AS "assetName",

            a.serial_no
              AS "serialNo",

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

          ${where}

          ORDER BY
            m.created_at DESC,
            m.maintenance_id DESC
          `,
          values
        );


      return res.json({
        count:
          rows.length,

        rows:
          rows.map(
            maintenanceLabels
          ),
      });

    } catch (err) {

      console.error(
        'Maintenance report error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to generate maintenance report.',
        });
    }
  }
);


module.exports = router;