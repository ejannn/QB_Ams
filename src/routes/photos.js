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


const multer = require('multer');
const { MAX_UPLOAD_BYTES } = require('../services/localPhotoStorage');
const uploadAssetPhoto = require('../controllers/photos/uploadAssetPhoto');
const getAssetPhotoFile = require('../controllers/photos/getAssetPhotoFile');

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, parts: 3 },
});
function uploadOnePhoto(req, res, next) {
  uploader.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Invalid photo upload.' });
  });
}

const router = express.Router();


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


// Upload JPEG/PNG/WebP as multipart/form-data with field name "photo".
router.post('/:assetId/photos/upload', requireAuth, requirePermission('Assets', 3), uploadOnePhoto, uploadAssetPhoto);

// Protected image content. Frontends must fetch with Authorization bearer token.
router.get('/:assetId/photos/:photoId/file', requireAuth, requirePermission('Assets', 2), getAssetPhotoFile);

// Legacy URL-based photo registration (kept for existing desktop clients).
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