const express = require('express');

const pool = require('../db/pool');

const requireAuth =
  require('../middleware/requireAuth');

const requirePermission =
  require('../middleware/requirePermission');

const {
  ACTION_NAMES,
} = require('../db/rbac');

const router = express.Router();


// ======================================================
// HELPERS
// ======================================================

function positiveInteger(value) {
  const number = Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  );
}


function validAuditAction(value) {
  const number = Number(value);

  return (
    Number.isInteger(number) &&
    number >= 1 &&
    number <= 4
  );
}


function serialize(row) {
  return {
    ...row,

    actionLabel:
      ACTION_NAMES[row.action] ||
      'unknown',
  };
}


// ======================================================
// SHARED SELECT
// ======================================================

const AUDIT_SELECT = `
  SELECT
    l.log_id
      AS "logId",

    l.user_id
      AS "userId",

    l.table_name
      AS "tableName",

    l.record_id
      AS "recordId",

    l.action,

    l.created_at
      AS "createdAt",

    CONCAT_WS(
      ' ',
      d.first_name,
      d.middle_name,
      d.last_name,
      d.extension
    ) AS "userName"

  FROM audit_logs l

  LEFT JOIN user_details d
    ON d.user_id =
      l.user_id
`;


// ======================================================
// GET AUDIT LOGS
//
// Optional filters:
//
// ?tableName=assets
// ?userId=1
// ?recordId=2
// ?action=3
// ?limit=100
// ?offset=0
// ======================================================

router.get(
  '/',
  requireAuth,
  requirePermission(
    'Audit Logs',
    2
  ),
  async (req, res) => {
    try {
      const conditions = [];
      const values = [];

      let index = 1;


      // TABLE

      if (req.query.tableName) {
        const tableName =
          String(
            req.query.tableName
          ).trim();

        if (!tableName) {
          return res
            .status(400)
            .json({
              error:
                'tableName cannot be empty.',
            });
        }

        conditions.push(
          `LOWER(l.table_name) = LOWER($${index++})`
        );

        values.push(
          tableName
        );
      }


      // USER

      if (
        req.query.userId !==
        undefined
      ) {
        const userId =
          Number(
            req.query.userId
          );

        if (
          !positiveInteger(
            userId
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'userId must be a positive integer.',
            });
        }

        conditions.push(
          `l.user_id = $${index++}`
        );

        values.push(
          userId
        );
      }


      // RECORD

      if (
        req.query.recordId !==
        undefined
      ) {
        const recordId =
          Number(
            req.query.recordId
          );

        if (
          !positiveInteger(
            recordId
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'recordId must be a positive integer.',
            });
        }

        conditions.push(
          `l.record_id = $${index++}`
        );

        values.push(
          recordId
        );
      }


      // ACTION

      if (
        req.query.action !==
        undefined
      ) {
        const action =
          Number(
            req.query.action
          );

        if (
          !validAuditAction(
            action
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                'action must be 1, 2, 3, or 4.',
            });
        }

        conditions.push(
          `l.action = $${index++}`
        );

        values.push(
          action
        );
      }


      const where =
        conditions.length
          ? `WHERE ${conditions.join(
              ' AND '
            )}`
          : '';


      // PAGINATION

      let limit =
        Number(
          req.query.limit
        );

      if (
        !Number.isInteger(limit) ||
        limit <= 0
      ) {
        limit = 100;
      }

      limit =
        Math.min(
          limit,
          500
        );


      let offset =
        Number(
          req.query.offset
        );

      if (
        !Number.isInteger(offset) ||
        offset < 0
      ) {
        offset = 0;
      }


      values.push(limit);

      const limitIndex =
        index++;


      values.push(offset);

      const offsetIndex =
        index++;


      const { rows } =
        await pool.query(
          `
          ${AUDIT_SELECT}

          ${where}

          ORDER BY
            l.created_at DESC,
            l.log_id DESC

          LIMIT $${limitIndex}

          OFFSET $${offsetIndex}
          `,
          values
        );


      return res.json(
        rows.map(serialize)
      );

    } catch (err) {
      console.error(
        'Fetch audit logs error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve audit logs.',
        });
    }
  }
);


// ======================================================
// GET ONE AUDIT LOG
// ======================================================

router.get(
  '/:id',
  requireAuth,
  requirePermission(
    'Audit Logs',
    2
  ),
  async (req, res) => {
    try {
      const logId =
        Number(
          req.params.id
        );


      if (
        !positiveInteger(
          logId
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'Audit log id must be a positive integer.',
          });
      }


      const { rows } =
        await pool.query(
          `
          ${AUDIT_SELECT}

          WHERE
            l.log_id = $1
          `,
          [logId]
        );


      if (!rows.length) {
        return res
          .status(404)
          .json({
            error:
              'Audit log not found.',
          });
      }


      return res.json(
        serialize(rows[0])
      );

    } catch (err) {
      console.error(
        'Fetch audit log error:',
        err
      );

      return res
        .status(500)
        .json({
          error:
            'Failed to retrieve audit log.',
        });
    }
  }
);


module.exports = router;