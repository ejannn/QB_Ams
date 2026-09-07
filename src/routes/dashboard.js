const express = require('express');
const pool = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requirePermission = require('../middleware/requirePermission');

const router = express.Router();

router.get('/', requireAuth, requirePermission('Dashboard', 2), async (req, res) => {
  try {
    const [assetCounts, damaged, inRepair, categories, recentTransfers] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total,
                         COUNT(*) FILTER (WHERE status = 1)::int AS active,
                         COUNT(*) FILTER (WHERE status = 0)::int AS inactive
                  FROM assets`),
      pool.query(`SELECT COUNT(*)::int AS count
                  FROM assets a
                  JOIN LATERAL (
                    SELECT condition FROM maintenance m
                    WHERE m.asset_id = a.asset_id
                    ORDER BY m.created_at DESC, m.maintenance_id DESC LIMIT 1
                  ) lm ON TRUE
                  WHERE lm.condition = 2`),
      pool.query(`SELECT COUNT(*)::int AS count
                  FROM assets a
                  JOIN LATERAL (
                    SELECT repair_status FROM maintenance m
                    WHERE m.asset_id = a.asset_id
                    ORDER BY m.created_at DESC, m.maintenance_id DESC LIMIT 1
                  ) lm ON TRUE
                  WHERE lm.repair_status = 1`),
      pool.query(`SELECT c.category_id AS "categoryId", c.name, COUNT(a.asset_id)::int AS count
                  FROM categories c
                  LEFT JOIN assets a ON a.category_id = c.category_id AND a.status = 1
                  GROUP BY c.category_id ORDER BY c.name`),
      pool.query(`SELECT t.asset_transfer_id AS "assetTransferId", t.asset_id AS "assetId",
                         a.asset_name AS "assetName", fl.name AS "fromLocationName", tl.name AS "toLocationName",
                         t.reason, t.created_at AS "createdAt"
                  FROM asset_transfer t
                  JOIN assets a ON a.asset_id = t.asset_id
                  LEFT JOIN locations fl ON fl.location_id = t.from_location_id
                  JOIN locations tl ON tl.location_id = t.to_location_id
                  ORDER BY t.created_at DESC, t.asset_transfer_id DESC LIMIT 10`),
    ]);

    res.json({
      totalAssets: assetCounts.rows[0].total,
      activeAssets: assetCounts.rows[0].active,
      inactiveAssets: assetCounts.rows[0].inactive,
      damagedAssets: damaged.rows[0].count,
      inRepairAssets: inRepair.rows[0].count,
      byCategory: categories.rows,
      recentTransfers: recentTransfers.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboard statistics.' });
  }
});

module.exports = router;
