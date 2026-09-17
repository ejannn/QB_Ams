async function createInitialCustody(
  client,
  {
    assetId,
    custodianUserId,
    assignedBy,
  }
) {
  if (custodianUserId === null) {
    return null;
  }

  const result = await client.query(
    `
    INSERT INTO asset_custody (
      asset_id,
      custodian_user_id,
      assigned_by,
      remarks
    )
    VALUES (
      $1,
      $2,
      $3,
      $4
    )
    RETURNING
      asset_custody_id
    `,
    [
      assetId,
      custodianUserId,
      assignedBy,
      'Initial custody assignment',
    ]
  );

  return result.rows[0]
    .asset_custody_id;
}


async function changeCustodian(
  client,
  {
    assetId,
    custodianUserId,
    assignedBy,
    remarks = null,
  }
) {
  const currentCustody =
    await client.query(
      `
      SELECT
        asset_custody_id,
        custodian_user_id

      FROM asset_custody

      WHERE
        asset_id = $1
        AND returned_at IS NULL

      LIMIT 1

      FOR UPDATE
      `,
      [assetId]
    );

  const current =
    currentCustody.rows[0] ||
    null;


  // Nothing to return
  if (
    !current &&
    custodianUserId === null
  ) {
    return {
      changed: false,
      closedCustodyId: null,
      newCustodyId: null,
    };
  }


  const sameCustodian =
    current &&
    custodianUserId !== null &&
    Number(
      current.custodian_user_id
    ) ===
    Number(
      custodianUserId
    );


  if (sameCustodian) {
    return {
      changed: false,
      closedCustodyId: null,
      newCustodyId: null,
    };
  }


  let closedCustodyId = null;
  let newCustodyId = null;


  // Close current custody
  if (current) {
    await client.query(
      `
      UPDATE asset_custody

      SET
        returned_at = NOW(),
        updated_at = NOW()

      WHERE
        asset_custody_id = $1
      `,
      [
        current.asset_custody_id,
      ]
    );

    closedCustodyId =
      current.asset_custody_id;
  }


  // Create new custody
  if (
    custodianUserId !== null
  ) {
    const result =
      await client.query(
        `
        INSERT INTO asset_custody (
          asset_id,
          custodian_user_id,
          assigned_by,
          remarks
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        RETURNING
          asset_custody_id
        `,
        [
          assetId,
          custodianUserId,
          assignedBy,

          remarks ||
          (
            current
              ? 'Custodian reassignment'
              : 'Custodian assignment'
          ),
        ]
      );

    newCustodyId =
      result.rows[0]
        .asset_custody_id;
  }


  return {
    changed: true,
    closedCustodyId,
    newCustodyId,
  };
}


async function getCustodyHistory(
  db,
  assetId
) {
  const result =
    await db.query(
      `
      SELECT
        ac.asset_custody_id
          AS "assetCustodyId",

        ac.asset_id
          AS "assetId",

        ac.custodian_user_id
          AS "custodianUserId",

        CONCAT_WS(
          ' ',
          ud.first_name,
          ud.middle_name,
          ud.last_name,
          ud.extension
        ) AS "custodianName",

        u.email
          AS "custodianEmail",

        ac.assigned_at
          AS "assignedAt",

        ac.returned_at
          AS "returnedAt",

        ac.assigned_by
          AS "assignedBy",

        CONCAT_WS(
          ' ',
          assigned_details.first_name,
          assigned_details.middle_name,
          assigned_details.last_name,
          assigned_details.extension
        ) AS "assignedByName",

        ac.remarks,

        ac.created_at
          AS "createdAt",

        ac.updated_at
          AS "updatedAt"

      FROM asset_custody ac

      JOIN users u
        ON u.user_id =
          ac.custodian_user_id

      LEFT JOIN user_details ud
        ON ud.user_id =
          u.user_id

      LEFT JOIN users assigned_user
        ON assigned_user.user_id =
          ac.assigned_by

      LEFT JOIN user_details assigned_details
        ON assigned_details.user_id =
          assigned_user.user_id

      WHERE
        ac.asset_id = $1

      ORDER BY
        ac.assigned_at DESC,
        ac.asset_custody_id DESC
      `,
      [assetId]
    );

  return result.rows;
}


module.exports = {
  createInitialCustody,
  changeCustodian,
  getCustodyHistory,
};