const pool =
  require('../../db/pool');

const {
  getCustodyHistory,
} = require('../../services/assetCustodyService');


async function getAssetCustody(
  req,
  res
) {
  try {
    const assetId =
      Number(
        req.params.assetId
      );


    if (
      !Number.isInteger(assetId)
    ) {
      return res
        .status(400)
        .json({
          error:
            'assetId must be an integer.',
        });
    }


    // Confirm asset exists
    const asset =
      await pool.query(
        `
        SELECT
          asset_id,
          asset_name

        FROM assets

        WHERE
          asset_id = $1
        `,
        [assetId]
      );


    if (
      !asset.rows.length
    ) {
      return res
        .status(404)
        .json({
          error:
            'Asset not found.',
        });
    }


    const history =
      await getCustodyHistory(
        pool,
        assetId
      );


    const current =
      history.find(
        custody =>
          custody.returnedAt === null
      ) || null;


    return res.json({
      assetId,

      assetName:
        asset.rows[0]
          .asset_name,

      current,

      history,
    });

  } catch (err) {
    console.error(
      'Fetch custody history error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Failed to retrieve custody history.',
      });
  }
}


module.exports =
  getAssetCustody;