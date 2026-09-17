const pool =
  require('../../db/pool');

const {
  getAssetPhotos,
} = require('../../services/assetPhotoService');


async function getAssetPhotosController(
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


    if (!asset.rows.length) {
      return res
        .status(404)
        .json({
          error:
            'Asset not found.',
        });
    }


    const photos =
      await getAssetPhotos(
        pool,
        assetId
      );


    const primary =
      photos.find(
        photo =>
          photo.isPrimary === true
      ) || null;


    return res.json({
      assetId,

      assetName:
        asset.rows[0]
          .asset_name,

      primary,

      photos,
    });

  } catch (err) {
    console.error(
      'Fetch asset photos error:',
      err
    );


    return res
      .status(500)
      .json({
        error:
          'Failed to retrieve asset photos.',
      });
  }
}


module.exports =
  getAssetPhotosController;