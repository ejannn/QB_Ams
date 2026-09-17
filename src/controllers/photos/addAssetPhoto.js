const pool =
  require('../../db/pool');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');

const {
  nullableText,
} = require('../../utils/assetHelpers');

const {
  addPhoto,
} = require('../../services/assetPhotoService');


async function addAssetPhoto(
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


    const imageUrl =
      nullableText(
        req.body.imageUrl
      );


    const storageKey =
      nullableText(
        req.body.storageKey
      );


    const caption =
      nullableText(
        req.body.caption
      );


    const isPrimary =
      req.body.isPrimary ??
      false;


    if (!imageUrl) {
      return res
        .status(400)
        .json({
          error:
            'imageUrl is required.',
        });
    }


    if (
      typeof isPrimary !==
      'boolean'
    ) {
      return res
        .status(400)
        .json({
          error:
            'isPrimary must be true or false.',
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
      await addPhoto(
        client,
        {
          assetId,
          imageUrl,
          storageKey,
          caption,
          isPrimary,

          uploadedBy:
            req.user.userId,
        }
      );


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
      result.photoId,
      AUDIT_ACTION.CREATE
    );


    await client.query(
      'COMMIT'
    );


    return res
      .status(201)
      .json({
        message:
          'Asset photo added successfully.',

        assetId,

        photoId:
          result.photoId,

        isPrimary,
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


    if (
      err.code === '23503'
    ) {
      return res
        .status(400)
        .json({
          error:
            'A referenced asset or user does not exist.',
        });
    }


    console.error(
      'Add asset photo error:',
      err
    );


    return res
      .status(500)
      .json({
        error:
          'Failed to add asset photo.',
      });

  } finally {
    client.release();
  }
}


module.exports =
  addAssetPhoto;