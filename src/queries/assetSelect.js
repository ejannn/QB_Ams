const ASSET_SELECT = `
  SELECT
    a.asset_id AS "assetId",
    a.asset_name AS "assetName",

    a.qr_id AS "qrId",
    q.qr_code_url AS "qrCodeUrl",
    q.is_active AS "qrIsActive",
    q.is_printed AS "qrIsPrinted",

    a.category_id AS "categoryId",
    c.name AS "categoryName",

    a.serial_no AS "serialNo",
    a.brand,
    a.model,

    TO_CHAR(
  a.purchase_date,
  'YYYY-MM-DD'
) AS "purchaseDate",

    primary_photo.image_url AS "assetImageUrl",

    current_custody.custodian_user_id AS "custodianUserId",

    CONCAT_WS(
      ' ',
      custodian_details.first_name,
      custodian_details.middle_name,
      custodian_details.last_name,
      custodian_details.extension
    ) AS "custodianName",

    custodian.email AS "custodianEmail",

    a.status,

    a.created_at AS "createdAt",
    a.updated_at AS "updatedAt",

    latest_transfer.to_location_id AS "currentLocationId",
    loc.name AS "currentLocationName",

    latest_maintenance.condition,

    latest_maintenance.repair_status AS "repairStatus"

  FROM assets a

  JOIN asset_qr q
    ON q.qr_id = a.qr_id

  JOIN categories c
    ON c.category_id = a.category_id

  LEFT JOIN asset_custody current_custody
    ON current_custody.asset_id = a.asset_id
    AND current_custody.returned_at IS NULL

  LEFT JOIN users custodian
    ON custodian.user_id = current_custody.custodian_user_id

  LEFT JOIN user_details custodian_details
    ON custodian_details.user_id = custodian.user_id

  LEFT JOIN asset_photos primary_photo
    ON primary_photo.asset_id = a.asset_id
    AND primary_photo.is_primary = TRUE

  LEFT JOIN LATERAL (
    SELECT
      t.to_location_id

    FROM asset_transfer t

    WHERE
      t.asset_id = a.asset_id

    ORDER BY
      t.created_at DESC,
      t.asset_transfer_id DESC

    LIMIT 1
  ) latest_transfer
    ON TRUE

  LEFT JOIN locations loc
    ON loc.location_id = latest_transfer.to_location_id

  LEFT JOIN LATERAL (
    SELECT
      m.condition,
      m.repair_status

    FROM maintenance m

    WHERE
      m.asset_id = a.asset_id

    ORDER BY
      m.created_at DESC,
      m.maintenance_id DESC

    LIMIT 1
  ) latest_maintenance
    ON TRUE
`;

module.exports = ASSET_SELECT;