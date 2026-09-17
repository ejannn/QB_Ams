async function createInitialPhoto(
  client,
  {
    assetId,
    imageUrl,
    uploadedBy,
  }
) {
  if (imageUrl === null) {
    return null;
  }

  const result =
    await client.query(
      `
      INSERT INTO asset_photos (
        asset_id,
        image_url,
        storage_key,
        caption,
        is_primary,
        uploaded_by
      )
      VALUES (
        $1,
        $2,
        NULL,
        $3,
        TRUE,
        $4
      )
      RETURNING
        asset_photo_id
      `,
      [
        assetId,
        imageUrl,
        'Initial asset photo',
        uploadedBy,
      ]
    );

  return result.rows[0]
    .asset_photo_id;
}


async function changePrimaryPhoto(
  client,
  {
    assetId,
    imageUrl,
    uploadedBy,
  }
) {
  const currentPhoto =
    await client.query(
      `
      SELECT
        asset_photo_id

      FROM asset_photos

      WHERE
        asset_id = $1
        AND is_primary = TRUE

      LIMIT 1

      FOR UPDATE
      `,
      [assetId]
    );


  let oldPhotoId = null;
  let newPhotoId = null;


  if (
    currentPhoto.rows.length
  ) {
    oldPhotoId =
      currentPhoto
        .rows[0]
        .asset_photo_id;

    await client.query(
      `
      UPDATE asset_photos

      SET
        is_primary = FALSE,
        updated_at = NOW()

      WHERE
        asset_photo_id = $1
      `,
      [oldPhotoId]
    );
  }


  if (imageUrl !== null) {
    const newPhoto =
      await client.query(
        `
        INSERT INTO asset_photos (
          asset_id,
          image_url,
          storage_key,
          caption,
          is_primary,
          uploaded_by
        )
        VALUES (
          $1,
          $2,
          NULL,
          $3,
          TRUE,
          $4
        )
        RETURNING
          asset_photo_id
        `,
        [
          assetId,
          imageUrl,
          'Updated asset photo',
          uploadedBy,
        ]
      );

    newPhotoId =
      newPhoto
        .rows[0]
        .asset_photo_id;
  }


  return {
    oldPhotoId,
    newPhotoId,
  };
}


// ==========================================================
// GET ALL PHOTOS FOR ASSET
// ==========================================================

async function getAssetPhotos(
  db,
  assetId
) {
  const result =
    await db.query(
      `
      SELECT
        ap.asset_photo_id
          AS "assetPhotoId",

        ap.asset_id
          AS "assetId",

        ap.image_url
          AS "imageUrl",

        ap.storage_key
          AS "storageKey",

        ap.caption,

        ap.is_primary
          AS "isPrimary",

        ap.uploaded_by
          AS "uploadedBy",

        CONCAT_WS(
          ' ',
          ud.first_name,
          ud.middle_name,
          ud.last_name,
          ud.extension
        ) AS "uploadedByName",

        u.email
          AS "uploadedByEmail",

        ap.created_at
          AS "createdAt",

        ap.updated_at
          AS "updatedAt"

      FROM asset_photos ap

      LEFT JOIN users u
        ON u.user_id =
          ap.uploaded_by

      LEFT JOIN user_details ud
        ON ud.user_id =
          u.user_id

      WHERE
        ap.asset_id = $1

      ORDER BY
        ap.is_primary DESC,
        ap.created_at DESC,
        ap.asset_photo_id DESC
      `,
      [assetId]
    );

  return result.rows;
}


// ==========================================================
// ADD PHOTO
// ==========================================================

async function addPhoto(
  client,
  {
    assetId,
    imageUrl,
    storageKey = null,
    caption = null,
    isPrimary = false,
    uploadedBy,
  }
) {
  let oldPrimaryPhotoId = null;


  // If new photo will become primary,
  // remove primary status from old photo first.
  if (isPrimary) {
    const current =
      await client.query(
        `
        SELECT
          asset_photo_id

        FROM asset_photos

        WHERE
          asset_id = $1
          AND is_primary = TRUE

        LIMIT 1

        FOR UPDATE
        `,
        [assetId]
      );


    if (current.rows.length) {
      oldPrimaryPhotoId =
        current.rows[0]
          .asset_photo_id;


      await client.query(
        `
        UPDATE asset_photos

        SET
          is_primary = FALSE,
          updated_at = NOW()

        WHERE
          asset_photo_id = $1
        `,
        [oldPrimaryPhotoId]
      );
    }
  }


  const result =
    await client.query(
      `
      INSERT INTO asset_photos (
        asset_id,
        image_url,
        storage_key,
        caption,
        is_primary,
        uploaded_by
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )
      RETURNING
        asset_photo_id
      `,
      [
        assetId,
        imageUrl,
        storageKey,
        caption,
        isPrimary,
        uploadedBy,
      ]
    );


  return {
    photoId:
      result.rows[0]
        .asset_photo_id,

    oldPrimaryPhotoId,
  };
}


// ==========================================================
// SET EXISTING PHOTO AS PRIMARY
// ==========================================================

async function setPrimaryPhoto(
  client,
  {
    assetId,
    photoId,
  }
) {
  const target =
    await client.query(
      `
      SELECT
        asset_photo_id,
        is_primary

      FROM asset_photos

      WHERE
        asset_photo_id = $1
        AND asset_id = $2

      FOR UPDATE
      `,
      [
        photoId,
        assetId,
      ]
    );


  if (!target.rows.length) {
    return {
      found: false,
      changed: false,
      oldPrimaryPhotoId: null,
      newPrimaryPhotoId: null,
    };
  }


  if (
    target.rows[0]
      .is_primary === true
  ) {
    return {
      found: true,
      changed: false,
      oldPrimaryPhotoId: null,
      newPrimaryPhotoId:
        photoId,
    };
  }


  const current =
    await client.query(
      `
      SELECT
        asset_photo_id

      FROM asset_photos

      WHERE
        asset_id = $1
        AND is_primary = TRUE

      LIMIT 1

      FOR UPDATE
      `,
      [assetId]
    );


  let oldPrimaryPhotoId = null;


  if (current.rows.length) {
    oldPrimaryPhotoId =
      current.rows[0]
        .asset_photo_id;


    await client.query(
      `
      UPDATE asset_photos

      SET
        is_primary = FALSE,
        updated_at = NOW()

      WHERE
        asset_photo_id = $1
      `,
      [oldPrimaryPhotoId]
    );
  }


  await client.query(
    `
    UPDATE asset_photos

    SET
      is_primary = TRUE,
      updated_at = NOW()

    WHERE
      asset_photo_id = $1
      AND asset_id = $2
    `,
    [
      photoId,
      assetId,
    ]
  );


  return {
    found: true,
    changed: true,
    oldPrimaryPhotoId,
    newPrimaryPhotoId:
      photoId,
  };
}


// ==========================================================
// DELETE PHOTO
// ==========================================================

async function deletePhoto(
  client,
  {
    assetId,
    photoId,
  }
) {
  const existing =
    await client.query(
      `
      SELECT
        asset_photo_id,
        is_primary

      FROM asset_photos

      WHERE
        asset_photo_id = $1
        AND asset_id = $2

      FOR UPDATE
      `,
      [
        photoId,
        assetId,
      ]
    );


  if (!existing.rows.length) {
    return {
      found: false,
      deletedPhotoId: null,
      wasPrimary: false,
    };
  }


  const wasPrimary =
    existing.rows[0]
      .is_primary;


  await client.query(
    `
    DELETE FROM asset_photos

    WHERE
      asset_photo_id = $1
      AND asset_id = $2
    `,
    [
      photoId,
      assetId,
    ]
  );


  return {
    found: true,
    deletedPhotoId:
      photoId,
    wasPrimary,
  };
}


module.exports = {
  createInitialPhoto,
  changePrimaryPhoto,

  getAssetPhotos,
  addPhoto,
  setPrimaryPhoto,
  deletePhoto,
};