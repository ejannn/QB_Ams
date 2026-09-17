const pool =
  require('../../db/pool');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');

const {
  setPrimaryPhoto,
} = require('../../services/assetPhotoService');


async function setPrimaryPhotoController(
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
      await setPrimaryPhoto(
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


    if (!result.changed) {
      await client.query(
        'COMMIT'
      );

      return res.json({
        message:
          'This photo is already the primary photo.',

        assetId,
        photoId,
      });
    }


    if (
      result.oldPrimaryPhotoId
    ) {
      await writeAudit(
        client,
        req.user.userId,
        'asset_photos',
        result.oldPrimaryPhotoId,
        AUDIT_ACTION.UPDATE
      );
    }


    await writeAudit(
      client,
      req.user.userId,
      'asset_photos',
      result.newPrimaryPhotoId,
      AUDIT_ACTION.UPDATE
    );


    await client.query(
      'COMMIT'
    );


    return res.json({
      message:
        'Primary photo updated successfully.',

      assetId,

      photoId:
        result.newPrimaryPhotoId,
    });

  } catch (err) {
    try {
      await client.query(
        'ROLLBACK'
      );
    } catch (_) {
      // Ignore rollback error
    }


    if (
      err.code === '23505'
    ) {
      return res
        .status(409)
        .json({
          error:
            'A primary photo constraint was violated.',
        });
    }


    console.error(
      'Set primary photo error:',
      err
    );


    return res
      .status(500)
      .json({
        error:
          'Failed to update primary photo.',
      });

  } finally {
    client.release();
  }
}


module.exports =
  setPrimaryPhotoController;