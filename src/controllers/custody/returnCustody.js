const pool =
  require('../../db/pool');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');

const {
  changeCustodian,
} = require('../../services/assetCustodyService');


async function returnCustody(
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


    const result =
      await changeCustodian(
        client,
        {
          assetId,

          custodianUserId:
            null,

          assignedBy:
            req.user.userId,
        }
      );


    if (
      !result.changed
    ) {
      await client.query(
        'ROLLBACK'
      );

      return res
        .status(400)
        .json({
          error:
            'This asset has no active custody assignment.',
        });
    }


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


    await client.query(
      'COMMIT'
    );


    return res.json({
      message:
        'Asset custody returned successfully.',

      assetId,

      closedCustodyId:
        result.closedCustodyId,
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
      'Return custody error:',
      err
    );


    return res
      .status(500)
      .json({
        error:
          'Failed to return asset custody.',
      });

  } finally {
    client.release();
  }
}


module.exports =
  returnCustody;