const pool = require('../../db/pool');

const ASSET_SELECT =
  require('../../queries/assetSelect');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');

const {
  addAssetLabels,
} = require('../../utils/labels');

const {
  changePrimaryPhoto,
} = require('../../services/assetPhotoService');

const {
  isIntIn,
  nullableText,
  nullableInteger,
  validateCustodian,
} = require('../../utils/assetHelpers');

const {
  changeCustodian,
} = require('../../services/assetCustodyService');

async function updateAsset(req, res) {
  const client = await pool.connect();

  try {
    const fields = [];
    const values = [];
    let i = 1;

    const add = (column, value) => {
      if (value !== undefined) {
        fields.push(`${column} = $${i++}`);
        values.push(value);
      }
    };


    // BASIC VALIDATION
    if (
      req.body.assetName !== undefined &&
      !String(req.body.assetName).trim()
    ) {
      return res.status(400).json({
        error: 'assetName cannot be empty.',
      });
    }

    if (
      req.body.status !== undefined &&
      !isIntIn(req.body.status, [0, 1])
    ) {
      return res.status(400).json({
        error: 'status must be 0 or 1.',
      });
    }

    if (
      req.body.categoryId !== undefined &&
      !Number.isInteger(
        Number(req.body.categoryId)
      )
    ) {
      return res.status(400).json({
        error:
          'categoryId must be an integer.',
      });
    }


    // DETECT SPECIAL CHANGES
    const hasCustodianChange =
      Object.prototype.hasOwnProperty.call(
        req.body,
        'custodianUserId'
      );

    const hasImageChange =
      Object.prototype.hasOwnProperty.call(
        req.body,
        'assetImageUrl'
      );

    const changingQr =
      Object.prototype.hasOwnProperty.call(
        req.body,
        'qrCodeUrl'
      );


    const normalizedCustodianId =
      hasCustodianChange
        ? nullableInteger(
            req.body.custodianUserId
          )
        : undefined;

    const normalizedImageUrl =
      hasImageChange
        ? nullableText(
            req.body.assetImageUrl
          )
        : undefined;


    if (
      Number.isNaN(
        normalizedCustodianId
      )
    ) {
      return res.status(400).json({
        error:
          'custodianUserId must be an integer or null.',
      });
    }


    // CORE ASSET FIELDS
    add(
      'asset_name',
      req.body.assetName === undefined
        ? undefined
        : String(
            req.body.assetName
          ).trim()
    );

    add(
      'category_id',
      req.body.categoryId === undefined
        ? undefined
        : Number(
            req.body.categoryId
          )
    );

    add(
      'serial_no',
      nullableText(
        req.body.serialNo
      )
    );

    add(
      'brand',
      nullableText(
        req.body.brand
      )
    );

    add(
      'model',
      nullableText(
        req.body.model
      )
    );

    add(
      'purchase_date',
      nullableText(
        req.body.purchaseDate
      )
    );

    add(
      'status',
      req.body.status === undefined
        ? undefined
        : Number(
            req.body.status
          )
    );


    if (
      !fields.length &&
      !hasCustodianChange &&
      !hasImageChange &&
      !changingQr
    ) {
      return res.status(400).json({
        error:
          'No asset fields provided.',
      });
    }


    await client.query('BEGIN');


    // CHECK ASSET
    const existing =
      await client.query(
        `
        SELECT
          asset_id,
          qr_id
        FROM assets
        WHERE asset_id = $1
        FOR UPDATE
        `,
        [req.params.id]
      );

    if (!existing.rows.length) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Asset not found.',
      });
    }


    // CHECK CATEGORY
    if (
      req.body.categoryId !== undefined
    ) {
      const category =
        await client.query(
          `
          SELECT category_id
          FROM categories
          WHERE category_id = $1
          `,
          [
            Number(
              req.body.categoryId
            ),
          ]
        );

      if (!category.rows.length) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          error:
            'categoryId does not exist.',
        });
      }
    }


    // VALIDATE CUSTODIAN
    if (
      hasCustodianChange &&
      normalizedCustodianId !== null
    ) {
      const validation =
        await validateCustodian(
          client,
          normalizedCustodianId
        );

      if (!validation.valid) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          error:
            validation.error,
        });
      }
    }


    // UPDATE CORE ASSET
    if (fields.length) {
      fields.push(
        'updated_at = NOW()'
      );

      fields.push(
        `updated_by = $${i++}`
      );

      values.push(
        req.user.userId
      );

      values.push(
        req.params.id
      );

      await client.query(
        `
        UPDATE assets
        SET
          ${fields.join(', ')}
        WHERE
          asset_id = $${i}
        `,
        values
      );

      await writeAudit(
        client,
        req.user.userId,
        'assets',
        Number(req.params.id),
        AUDIT_ACTION.UPDATE
      );
    }


    // CUSTODIAN UPDATE
    // ======================================================
// UPDATE CUSTODIAN
// ======================================================

if (hasCustodianChange) {
  const custodyChange =
    await changeCustodian(
      client,
      {
        assetId:
          req.params.id,

        custodianUserId:
          normalizedCustodianId,

        assignedBy:
          req.user.userId,
      }
    );


  if (
    custodyChange.closedCustodyId
  ) {
    await writeAudit(
      client,
      req.user.userId,
      'asset_custody',
      custodyChange
        .closedCustodyId,
      AUDIT_ACTION.UPDATE
    );
  }


  if (
    custodyChange.newCustodyId
  ) {
    await writeAudit(
      client,
      req.user.userId,
      'asset_custody',
      custodyChange
        .newCustodyId,
      AUDIT_ACTION.CREATE
    );
  }
}


    // ======================================================
// UPDATE PRIMARY PHOTO
// ======================================================

if (hasImageChange) {
  const photoChange =
    await changePrimaryPhoto(
      client,
      {
        assetId:
          req.params.id,

        imageUrl:
          normalizedImageUrl,

        uploadedBy:
          req.user.userId,
      }
    );


  if (
    photoChange.oldPhotoId
  ) {
    await writeAudit(
      client,
      req.user.userId,
      'asset_photos',
      photoChange.oldPhotoId,
      AUDIT_ACTION.UPDATE
    );
  }


  if (
    photoChange.newPhotoId
  ) {
    await writeAudit(
      client,
      req.user.userId,
      'asset_photos',
      photoChange.newPhotoId,
      AUDIT_ACTION.CREATE
    );
  }
}


    // QR UPDATE
    if (changingQr) {
      const newQrCode =
        String(
          req.body.qrCodeUrl ||
          ''
        ).trim();

      if (!newQrCode) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          error:
            'qrCodeUrl cannot be empty.',
        });
      }


      await client.query(
        `
        UPDATE asset_qr
        SET
          qr_code_url = $1,
          updated_at = NOW(),
          updated_by = $2
        WHERE
          qr_id = $3
        `,
        [
          newQrCode,

          req.user.userId,

          existing.rows[0].qr_id,
        ]
      );


      await writeAudit(
        client,
        req.user.userId,
        'asset_qr',
        existing.rows[0].qr_id,
        AUDIT_ACTION.UPDATE
      );
    }


    await client.query('COMMIT');


    // RETURN UPDATED ASSET
    const { rows } =
      await pool.query(
        `
        ${ASSET_SELECT}

        WHERE
          a.asset_id = $1
        `,
        [req.params.id]
      );


    return res.json(
      addAssetLabels(
        rows[0]
      )
    );

  } catch (err) {

    try {
      await client.query(
        'ROLLBACK'
      );
    } catch (_) {
      // ignore rollback error
    }


    if (
      err.code === '23503'
    ) {
      return res.status(400).json({
        error:
          'A referenced category, custodian, or related record does not exist.',
      });
    }


    if (
      err.code === '23505'
    ) {
      return res.status(409).json({
        error:
          'A unique QR, custody, or photo constraint was violated.',
      });
    }


    if (
      err.code === '22007' ||
      err.code === '22008'
    ) {
      return res.status(400).json({
        error:
          'purchaseDate is invalid. Use YYYY-MM-DD.',
      });
    }


    console.error(
      'Update asset error:',
      err
    );


    return res.status(500).json({
      error:
        'Failed to update asset.',
    });

  } finally {
    client.release();
  }
}


module.exports = updateAsset;