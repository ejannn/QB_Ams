function isIntIn(value, allowed) {
  const number = Number(value);

  return (
    Number.isInteger(number) &&
    allowed.includes(number)
  );
}

function nullableText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const cleaned =
    String(value).trim();

  return cleaned || null;
}

function nullableInteger(value) {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isInteger(number)
  ) {
    return NaN;
  }

  return number;
}

async function validateCustodian(
  client,
  custodianUserId
) {
  const result =
    await client.query(
      `
      SELECT
        u.user_id,
        u.email,
        r.role_name

      FROM users u

      JOIN roles r
        ON r.role_id = u.role_id

      WHERE
        u.user_id = $1
      `,
      [custodianUserId]
    );

  if (!result.rows.length) {
    return {
      valid: false,
      error:
        'custodianUserId does not exist.',
    };
  }

  if (
    result.rows[0].role_name !==
    'Custodian'
  ) {
    return {
      valid: false,
      error:
        'The selected user must have the Custodian role.',
    };
  }

  return {
    valid: true,
    user: result.rows[0],
  };
}

module.exports = {
  isIntIn,
  nullableText,
  nullableInteger,
  validateCustodian,
};