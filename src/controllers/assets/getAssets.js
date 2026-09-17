const pool = require('../../db/pool');

const ASSET_SELECT = require('../../queries/assetSelect');

const {
  addAssetLabels,
} = require('../../utils/labels');

async function getAssets(req, res) {
  try {
    const conditions = [];
    const values = [];

    let i = 1;

    // STATUS FILTER
    if (
      req.query.status !== undefined
    ) {
      conditions.push(
        `a.status = $${i++}`
      );

      values.push(
        Number(req.query.status)
      );
    }

    // CATEGORY FILTER
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

    // LOCATION FILTER
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

    // CUSTODIAN FILTER
    if (
      req.query.custodianUserId
    ) {
      conditions.push(
        `current_custody.custodian_user_id = $${i++}`
      );

      values.push(
        Number(
          req.query.custodianUserId
        )
      );
    }

    // SEARCH
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

    return res.json(
      rows.map(
        addAssetLabels
      )
    );
  } catch (err) {
    console.error(
      'Fetch assets error:',
      err
    );

    return res.status(500).json({
      error:
        'Failed to retrieve assets.',
    });
  }
}

module.exports = getAssets;