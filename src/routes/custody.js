const express =
  require('express');

const requireAuth =
  require('../middleware/requireAuth');

const requirePermission =
  require('../middleware/requirePermission');


const getAssetCustody =
  require('../controllers/custody/getAssetCustody');

const assignCustodian =
  require('../controllers/custody/assignCustodian');

const returnCustody =
  require('../controllers/custody/returnCustody');


const router =
  express.Router();


// GET CUSTODY HISTORY
router.get(
  '/:assetId/custody',

  requireAuth,

  requirePermission(
    'Assets',
    2
  ),

  getAssetCustody
);


// ASSIGN / REASSIGN
router.post(
  '/:assetId/custody',

  requireAuth,

  requirePermission(
    'Assets',
    3
  ),

  assignCustodian
);


// RETURN ASSET
router.post(
  '/:assetId/custody/return',

  requireAuth,

  requirePermission(
    'Assets',
    3
  ),

  returnCustody
);


module.exports =
  router;