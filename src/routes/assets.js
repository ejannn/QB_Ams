const express = require('express');

const requireAuth =
  require('../middleware/requireAuth');

const requirePermission =
  require('../middleware/requirePermission');


const getAssets =
  require('../controllers/assets/getAssets');

const scanAsset =
  require('../controllers/assets/scanAsset');

const getAsset =
  require('../controllers/assets/getAsset');

const createAsset =
  require('../controllers/assets/createAsset');

const updateAsset =
  require('../controllers/assets/updateAsset');

const deactivateAsset =
  require('../controllers/assets/deactivateAsset');


const router = express.Router();


// GET ALL ASSETS
router.get(
  '/',
  requireAuth,
  requirePermission(
    'Assets',
    2
  ),
  getAssets
);


// SCAN QR
// Must stay BEFORE /:id
router.get(
  '/scan',
  requireAuth,
  requirePermission(
    'Assets',
    2
  ),
  scanAsset
);


// GET ONE ASSET
router.get(
  '/:id',
  requireAuth,
  requirePermission(
    'Assets',
    2
  ),
  getAsset
);


// CREATE ASSET
router.post(
  '/',
  requireAuth,
  requirePermission(
    'Assets',
    1
  ),
  createAsset
);


// UPDATE ASSET
router.patch(
  '/:id',
  requireAuth,
  requirePermission(
    'Assets',
    3
  ),
  updateAsset
);


// SOFT DELETE ASSET
router.delete(
  '/:id',
  requireAuth,
  requirePermission(
    'Assets',
    4
  ),
  deactivateAsset
);


module.exports = router;