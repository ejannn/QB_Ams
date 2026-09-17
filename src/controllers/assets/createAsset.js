const { randomUUID } = require('crypto');

const pool = require('../../db/pool');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');

const {
  createInitialPhoto,
} = require('../../services/assetPhotoService');

const {
  addAssetLabels,
} = require('../../utils/labels');

const ASSET_SELECT =
  require('../../queries/assetSelect');

const {
  isIntIn,
  nullableText,
  nullableInteger,
  validateCustodian,
} = require('../../utils/assetHelpers');

const {
  createInitialCustody,
} = require('../../services/assetCustodyService');


async function createAsset(req, res) {
  const client = await pool.connect();

  try {
    const {
      assetName,
      categoryId,

      serialNo = null,
      brand = null,
      model = null,

      purchaseDate = null,

      custodianUserId = null,

      assetImageUrl = null,

      status = 1,

      qrCodeUrl = null,

      locationId = null,

      condition = 0,

      repairStatus = 0,

      transferReason = 'Initial asset location',
    } = req.body;


    // ======================================================
    // BASIC VALIDATION
    // ======================================================

    if (
      !assetName ||
      !String(assetName).trim()
    ) {
      return res.status(400).json({
        error: 'assetName is required.',
      });
    }

    if (!categoryId) {
      return res.status(400).json({
        error: 'categoryId is required.',
      });
    }

    if (
      !Number.isInteger(
        Number(categoryId)
      )
    ) {
      return res.status(400).json({
        error:
          'categoryId must be an integer.',
      });
    }

    if (
      !isIntIn(
        status,
        [0, 1]
      )
    ) {
      return res.status(400).json({
        error:
          'status must be 0 (Inactive) or 1 (Active).',
      });
    }

    if (
      !isIntIn(
        condition,
        [0, 1, 2]
      )
    ) {
      return res.status(400).json({
        error:
          'condition must be 0 (New), 1 (Good), or 2 (Damaged).',
      });
    }

    if (
      !isIntIn(
        repairStatus,
        [0, 1, 2]
      )
    ) {
      return res.status(400).json({
        error:
          'repairStatus must be 0 (No Repair), 1 (In Repair), or 2 (Discard).',
      });
    }


    // ======================================================
    // NORMALIZE VALUES
    // ======================================================

    const normalizedCustodianId =
      nullableInteger(
        custodianUserId
      );

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

    const normalizedLocationId =
      nullableInteger(
        locationId
      );

    if (
      Number.isNaN(
        normalizedLocationId
      )
    ) {
      return res.status(400).json({
        error:
          'locationId must be an integer or null.',
      });
    }

    const normalizedPurchaseDate =
      nullableText(
        purchaseDate
      );

    const normalizedImageUrl =
      nullableText(
        assetImageUrl
      );

    const normalizedSerialNo =
      nullableText(
        serialNo
      );

    const normalizedBrand =
      nullableText(
        brand
      );

    const normalizedModel =
      nullableText(
        model
      );


    // ======================================================
    // BEGIN TRANSACTION
    // ======================================================

    await client.query('BEGIN');


    // ======================================================
    // CHECK CATEGORY
    // ======================================================

    const category =
      await client.query(
        `
        SELECT
          category_id
        FROM categories
        WHERE category_id = $1
        `,
        [
          Number(
            categoryId
          ),
        ]
      );

    if (
      !category.rows.length
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'categoryId does not exist.',
      });
    }


    // ======================================================
    // CHECK LOCATION
    // ======================================================

    if (
      normalizedLocationId !== null
    ) {
      const location =
        await client.query(
          `
          SELECT
            location_id
          FROM locations
          WHERE location_id = $1
          `,
          [
            normalizedLocationId,
          ]
        );

      if (
        !location.rows.length
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'locationId does not exist.',
        });
      }
    }


    // ======================================================
    // CHECK CUSTODIAN
    // ======================================================

    if (
      normalizedCustodianId !== null
    ) {
      const validation =
        await validateCustodian(
          client,
          normalizedCustodianId
        );

      if (
        !validation.valid
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            validation.error,
        });
      }
    }


    // ======================================================
    // CREATE QR
    // ======================================================

    const finalQrCodeUrl =
      String(
        qrCodeUrl ||
        `ams://asset/${randomUUID()}`
      ).trim();

    const qrResult =
      await client.query(
        `
        INSERT INTO asset_qr (
          qr_code_url,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          $2,
          $2
        )
        RETURNING
          qr_id
        `,
        [
          finalQrCodeUrl,
          req.user.userId,
        ]
      );

    const qrId =
      qrResult.rows[0].qr_id;


    // ======================================================
    // CREATE CORE ASSET
    // ======================================================

    const assetResult =
      await client.query(
        `
        INSERT INTO assets (
          asset_name,
          qr_id,
          category_id,

          serial_no,
          brand,
          model,

          purchase_date,

          status,

          created_by,
          updated_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $9
        )
        RETURNING
          asset_id
        `,
        [
          String(
            assetName
          ).trim(),

          qrId,

          Number(
            categoryId
          ),

          normalizedSerialNo,

          normalizedBrand,

          normalizedModel,

          normalizedPurchaseDate,

          Number(
            status
          ),

          req.user.userId,
        ]
      );

    const assetId =
      assetResult.rows[0]
        .asset_id;


    // ======================================================
    // INITIAL CUSTODY
    // ======================================================

    // ======================================================
// INITIAL CUSTODY
// ======================================================

const custodyId =
  await createInitialCustody(
    client,
    {
      assetId,
      custodianUserId:
        normalizedCustodianId,
      assignedBy:
        req.user.userId,
    }
  );


 // ======================================================
// INITIAL PRIMARY PHOTO
// ======================================================

const photoId =
  await createInitialPhoto(
    client,
    {
      assetId,

      imageUrl:
        normalizedImageUrl,

      uploadedBy:
        req.user.userId,
    }
  );
  
    // ======================================================
    // INITIAL MAINTENANCE
    // ======================================================

    const maintenanceResult =
      await client.query(
        `
        INSERT INTO maintenance (
          asset_id,
          condition,
          repair_status,
          created_by,
          updated_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $4
        )
        RETURNING
          maintenance_id
        `,
        [
          assetId,

          Number(
            condition
          ),

          Number(
            repairStatus
          ),

          req.user.userId,
        ]
      );


    // ======================================================
    // INITIAL LOCATION
    // ======================================================

    let transferId = null;

    if (
      normalizedLocationId !== null
    ) {
      const transferResult =
        await client.query(
          `
          INSERT INTO asset_transfer (
            user_id,
            asset_id,
            from_location_id,
            to_location_id,
            reason,
            created_by,
            updated_by
          )
          VALUES (
            $1,
            $2,
            NULL,
            $3,
            $4,
            $1,
            $1
          )
          RETURNING
            asset_transfer_id
          `,
          [
            req.user.userId,

            assetId,

            normalizedLocationId,

            transferReason,
          ]
        );

      transferId =
        transferResult
          .rows[0]
          .asset_transfer_id;
    }


    // ======================================================
    // AUDIT LOGS
    // ======================================================

    await writeAudit(
      client,
      req.user.userId,
      'asset_qr',
      qrId,
      AUDIT_ACTION.CREATE
    );

    await writeAudit(
      client,
      req.user.userId,
      'assets',
      assetId,
      AUDIT_ACTION.CREATE
    );

    if (custodyId) {
      await writeAudit(
        client,
        req.user.userId,
        'asset_custody',
        custodyId,
        AUDIT_ACTION.CREATE
      );
    }

    if (photoId) {
      await writeAudit(
        client,
        req.user.userId,
        'asset_photos',
        photoId,
        AUDIT_ACTION.CREATE
      );
    }

    await writeAudit(
      client,
      req.user.userId,
      'maintenance',
      maintenanceResult
        .rows[0]
        .maintenance_id,
      AUDIT_ACTION.CREATE
    );

    if (transferId) {
      await writeAudit(
        client,
        req.user.userId,
        'asset_transfer',
        transferId,
        AUDIT_ACTION.CREATE
      );
    }


    // ======================================================
    // COMMIT
    // ======================================================

    await client.query(
      'COMMIT'
    );


    // ======================================================
    // RETURN CREATED ASSET
    // ======================================================

    const { rows } =
      await pool.query(
        `
        ${ASSET_SELECT}

        WHERE
          a.asset_id = $1
        `,
        [assetId]
      );

    return res
      .status(201)
      .json(
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
      // Ignore rollback error
    }

    if (
      err.code === '23505'
    ) {
      return res
        .status(409)
        .json({
          error:
            'A unique asset, QR, custody, or photo constraint was violated.',
        });
    }

    if (
      err.code === '23503'
    ) {
      return res
        .status(400)
        .json({
          error:
            'A referenced category, custodian, location, or related record does not exist.',
        });
    }

    if (
      err.code === '22007' ||
      err.code === '22008'
    ) {
      return res
        .status(400)
        .json({
          error:
            'purchaseDate is invalid. Use YYYY-MM-DD.',
        });
    }

    console.error(
      'Create asset error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Failed to create asset.',
      });

  } finally {
    client.release();
  }
}


module.exports = createAsset;