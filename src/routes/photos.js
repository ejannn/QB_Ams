const express =
  require('express');

const requireAuth =
  require('../middleware/requireAuth');

const requirePermission =
  require('../middleware/requirePermission');


const getAssetPhotos =
  require('../controllers/photos/getAssetPhotos');

const addAssetPhoto =
  require('../controllers/photos/addAssetPhoto');

const setPrimaryPhoto =
  require('../controllers/photos/setPrimaryPhoto');

const deleteAssetPhoto =
  require('../controllers/photos/deleteAssetPhoto');


const router =
  express.Router();


// GET ALL PHOTOS
router.get(
  '/:assetId/photos',

  requireAuth,

  requirePermission(
    'Assets',
    2
  ),

  getAssetPhotos
);


// ADD PHOTO
router.post(
  '/:assetId/photos',

  requireAuth,

  requirePermission(
    'Assets',
    3
  ),

  addAssetPhoto
);


// SET EXISTING PHOTO AS PRIMARY
router.patch(
  '/:assetId/photos/:photoId/primary',

  requireAuth,

  requirePermission(
    'Assets',
    3
  ),

  setPrimaryPhoto
);


// DELETE PHOTO
router.delete(
  '/:assetId/photos/:photoId',

  requireAuth,

  requirePermission(
    'Assets',
    4
  ),

  deleteAssetPhoto
);


module.exports =
  router;