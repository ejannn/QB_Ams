const pool = require('../../db/pool');

const ASSET_SELECT = require('../../queries/assetSelect');

const {
  addAssetLabels,
} = require('../../utils/labels');

async function scanAsset(req, res) {
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

    const asset =
  addAssetLabels(
    rows[0]
  );

if (
  asset.qrIsActive === false
) {
  return res
    .status(410)
    .json({
      error:
        'QR code is inactive.',
    });
}

return res.json(asset);
  } catch (err) {
    console.error(
      'Scan asset error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Failed to retrieve scanned asset.',
      });
  }
}

module.exports = scanAsset;