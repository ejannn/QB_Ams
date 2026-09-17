const pool =
  require('../../db/pool');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');

const {
  deletePhoto,
} = require('../../services/assetPhotoService');


async function deleteAssetPhoto(
  req,
  res
) {
  const client =
    await pool.connect();


  try {
    const assetId =
      Number(
        req.params.assetId
      );

    const photoId =
      Number(
        req.params.photoId
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


    if (
      !Number.isInteger(photoId)
    ) {
      return res
        .status(400)
        .json({
          error:
            'photoId must be an integer.',
        });
    }


    await client.query(
      'BEGIN'
    );


    const asset =
      await client.query(
        `
        SELECT
          asset_id

        FROM assets

        WHERE
          asset_id = $1

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
            'Asset not found.',
        });
    }


    const result =
      await deletePhoto(
        client,
        {
          assetId,
          photoId,
        }
      );


    if (!result.found) {
      await client.query(
        'ROLLBACK'
      );

      return res
        .status(404)
        .json({
          error:
            'Photo not found for this asset.',
        });
    }


    await writeAudit(
      client,
      req.user.userId,
      'asset_photos',
      result.deletedPhotoId,
      AUDIT_ACTION.DELETE
    );


    await client.query(
      'COMMIT'
    );


    return res.json({
      message:
        'Asset photo deleted successfully.',

      assetId,

      photoId:
        result.deletedPhotoId,

      wasPrimary:
        result.wasPrimary,
    });

  } catch (err) {
    try {
      await client.query(
        'ROLLBACK'
      );
    } catch (_) {
      // Ignore rollback error
    }


    console.error(
      'Delete asset photo error:',
      err
    );


    return res
      .status(500)
      .json({
        error:
          'Failed to delete asset photo.',
      });

  } finally {
    client.release();
  }
}


module.exports =
  deleteAssetPhoto;