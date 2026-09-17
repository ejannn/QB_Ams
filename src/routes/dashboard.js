const express = require('express');
const pool = require('../db/pool');

const requireAuth =
  require('../middleware/requireAuth');

const requirePermission =
  require('../middleware/requirePermission');

const router = express.Router();


router.get(
  '/',
  requireAuth,
  requirePermission('Dashboard', 2),
  async (req, res) => {
    try {

      const [
        assetCounts,
        healthCounts,
        custodyCounts,
        locationCounts,
        qrCounts,
        categories,
        locations,
        recentTransfers,
        recentMaintenance,
      ] = await Promise.all([

        // ==================================================
        // ASSET COUNTS
        // ==================================================

        pool.query(`
          SELECT
            COUNT(*)::int
              AS total,

            COUNT(*) FILTER (
              WHERE status = 1
            )::int AS active,

            COUNT(*) FILTER (
              WHERE status = 0
            )::int AS inactive

          FROM assets
        `),


        // ==================================================
        // HEALTH / MAINTENANCE
        // ==================================================

        pool.query(`
          SELECT
            COUNT(*) FILTER (
              WHERE lm.condition = 2
            )::int AS damaged,

            COUNT(*) FILTER (
              WHERE lm.repair_status = 1
            )::int AS "inRepair"

          FROM assets a

          LEFT JOIN LATERAL (
            SELECT
              condition,
              repair_status

            FROM maintenance m

            WHERE
              m.asset_id = a.asset_id

            ORDER BY
              m.created_at DESC,
              m.maintenance_id DESC

            LIMIT 1
          ) lm ON TRUE

          WHERE
            a.status = 1
        `),


        // ==================================================
        // CUSTODY COUNTS
        // ==================================================

        pool.query(`
          SELECT
            COUNT(*) FILTER (
              WHERE ac.asset_id IS NOT NULL
            )::int AS assigned,

            COUNT(*) FILTER (
              WHERE ac.asset_id IS NULL
            )::int AS unassigned

          FROM assets a

          LEFT JOIN asset_custody ac
            ON ac.asset_id = a.asset_id
            AND ac.returned_at IS NULL

          WHERE
            a.status = 1
        `),


        // ==================================================
        // LOCATION COUNTS
        // ==================================================

        pool.query(`
          SELECT
            COUNT(*) FILTER (
              WHERE lt.to_location_id IS NULL
            )::int AS "withoutLocation"

          FROM assets a

          LEFT JOIN LATERAL (
            SELECT
              to_location_id

            FROM asset_transfer t

            WHERE
              t.asset_id = a.asset_id

            ORDER BY
              t.created_at DESC,
              t.asset_transfer_id DESC

            LIMIT 1
          ) lt ON TRUE

          WHERE
            a.status = 1
        `),


        // ==================================================
        // QR COUNTS
        // ==================================================

        pool.query(`
          SELECT
            COUNT(*) FILTER (
              WHERE q.is_printed = TRUE
            )::int AS printed,

            COUNT(*) FILTER (
              WHERE q.is_printed = FALSE
            )::int AS unprinted,

            COUNT(*) FILTER (
              WHERE q.is_active = FALSE
            )::int AS inactive

          FROM assets a

          JOIN asset_qr q
            ON q.qr_id = a.qr_id

          WHERE
            a.status = 1
        `),


        // ==================================================
        // BY CATEGORY
        // ==================================================

        pool.query(`
          SELECT
            c.category_id
              AS "categoryId",

            c.name,

            COUNT(a.asset_id)::int
              AS count

          FROM categories c

          LEFT JOIN assets a
            ON a.category_id =
              c.category_id
            AND a.status = 1

          GROUP BY
            c.category_id,
            c.name

          ORDER BY c.name
        `),


        // ==================================================
        // BY LOCATION
        // ==================================================

        pool.query(`
          SELECT
            lt.to_location_id
              AS "locationId",

            COALESCE(
              l.name,
              'Unassigned'
            ) AS name,

            COUNT(*)::int
              AS count

          FROM assets a

          LEFT JOIN LATERAL (
            SELECT
              to_location_id

            FROM asset_transfer t

            WHERE
              t.asset_id = a.asset_id

            ORDER BY
              t.created_at DESC,
              t.asset_transfer_id DESC

            LIMIT 1
          ) lt ON TRUE

          LEFT JOIN locations l
            ON l.location_id =
              lt.to_location_id

          WHERE
            a.status = 1

          GROUP BY
            lt.to_location_id,
            l.name

          ORDER BY name
        `),


        // ==================================================
        // RECENT TRANSFERS
        // ==================================================

        pool.query(`
          SELECT
            t.asset_transfer_id
              AS "assetTransferId",

            t.asset_id
              AS "assetId",

            a.asset_name
              AS "assetName",

            fl.name
              AS "fromLocationName",

            tl.name
              AS "toLocationName",

            t.reason,

            t.created_at
              AS "createdAt"

          FROM asset_transfer t

          JOIN assets a
            ON a.asset_id = t.asset_id

          LEFT JOIN locations fl
            ON fl.location_id =
              t.from_location_id

          JOIN locations tl
            ON tl.location_id =
              t.to_location_id

          ORDER BY
            t.created_at DESC,
            t.asset_transfer_id DESC

          LIMIT 10
        `),


        // ==================================================
        // RECENT MAINTENANCE
        // ==================================================

        pool.query(`
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
              AS "createdAt"

          FROM maintenance m

          JOIN assets a
            ON a.asset_id =
              m.asset_id

          ORDER BY
            m.created_at DESC,
            m.maintenance_id DESC

          LIMIT 10
        `),
      ]);


      return res.json({

        totalAssets:
          assetCounts.rows[0].total,

        activeAssets:
          assetCounts.rows[0].active,

        inactiveAssets:
          assetCounts.rows[0].inactive,


        damagedAssets:
          healthCounts.rows[0].damaged,

        inRepairAssets:
          healthCounts.rows[0].inRepair,


        assignedAssets:
          custodyCounts.rows[0].assigned,

        unassignedAssets:
          custodyCounts.rows[0].unassigned,


        assetsWithoutLocation:
          locationCounts.rows[0]
            .withoutLocation,


        printedQrCodes:
          qrCounts.rows[0].printed,

        unprintedQrCodes:
          qrCounts.rows[0].unprinted,

        inactiveQrCodes:
          qrCounts.rows[0].inactive,


        byCategory:
          categories.rows,

        byLocation:
          locations.rows,


        recentTransfers:
          recentTransfers.rows,

        recentMaintenance:
          recentMaintenance.rows,
      });

    } catch (err) {

      console.error(
        'Dashboard error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve dashboard statistics.',
        });
    }
  }
);


module.exports = router;