const pool = require('../../db/pool');

const {
  writeAudit,
  AUDIT_ACTION,
} = require('../../utils/audit');


async function deactivateAsset(req, res) {
  try {
    const { rows } =
      await pool.query(
        `
        UPDATE assets

        SET
          status = 0,
          updated_at = NOW(),
          updated_by = $1

        WHERE
          asset_id = $2

        RETURNING
          asset_id
        `,
        [
          req.user.userId,
          req.params.id,
        ]
      );

    if (!rows.length) {
      return res
        .status(404)
        .json({
          error:
            'Asset not found.',
        });
    }

    await writeAudit(
      pool,
      req.user.userId,
      'assets',
      Number(req.params.id),
      AUDIT_ACTION.DELETE
    );

    return res.json({
      message:
        'Asset marked inactive.',

      assetId:
        Number(req.params.id),
    });

  } catch (err) {
    console.error(
      'Deactivate asset error:',
      err
    );

    return res
      .status(500)
      .json({
        error:
          'Failed to deactivate asset.',
      });
  }
}


module.exports = deactivateAsset;