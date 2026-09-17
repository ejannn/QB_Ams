const pool =
  require('../../db/pool');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');

const {
  validateCustodian,
} = require('../../utils/assetHelpers');

const {
  changeCustodian,
} = require('../../services/assetCustodyService');


async function assignCustodian(
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

    const custodianUserId =
      Number(
        req.body.custodianUserId
      );

    const remarks =
      req.body.remarks
        ? String(
            req.body.remarks
          ).trim()
        : null;


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
      !Number.isInteger(
        custodianUserId
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'custodianUserId is required and must be an integer.',
        });
    }


    await client.query(
      'BEGIN'
    );


    // Confirm asset exists
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


    if (
      !asset.rows.length
    ) {
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


    // Validate Custodian role
    const validation =
      await validateCustodian(
        client,
        custodianUserId
      );


    if (
      !validation.valid
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res
        .status(400)
        .json({
          error:
            validation.error,
        });
    }


    const result =
      await changeCustodian(
        client,
        {
          assetId,

          custodianUserId,

          assignedBy:
            req.user.userId,

          remarks,
        }
      );


    if (
      result.closedCustodyId
    ) {
      await writeAudit(
        client,
        req.user.userId,
        'asset_custody',
        result.closedCustodyId,
        AUDIT_ACTION.UPDATE
      );
    }


    if (
      result.newCustodyId
    ) {
      await writeAudit(
        client,
        req.user.userId,
        'asset_custody',
        result.newCustodyId,
        AUDIT_ACTION.CREATE
      );
    }


    await client.query(
      'COMMIT'
    );


    if (!result.changed) {
      return res.json({
        message:
          'Custodian is already assigned to this asset.',

        assetId,

        custodianUserId,
      });
    }


    return res
      .status(201)
      .json({
        message:
          'Custodian assigned successfully.',

        assetId,

        custodianUserId,

        custodyId:
          result.newCustodyId,
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
            'This asset already has an active custody assignment.',
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
      'Assign custodian error:',
      err
    );


    return res
      .status(500)
      .json({
        error:
          'Failed to assign custodian.',
      });

  } finally {
    client.release();
  }
}


module.exports =
  assignCustodian;