const pool = require('../../db/pool');

const ASSET_SELECT = require('../../queries/assetSelect');

const {
  addAssetLabels,
} = require('../../utils/labels');

async function getAsset(req, res) {
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

    return res.json(
      addAssetLabels(
        rows[0]
      )
    );
  } catch (err) {
    console.error(
      'Fetch asset error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Failed to retrieve asset.',
      });
  }
}

module.exports = getAsset;