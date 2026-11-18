const pool = require('../../db/pool');
const { writeAudit, AUDIT_ACTION } = require('../../utils/audit');
const { addPhoto } = require('../../services/assetPhotoService');
const {
  MAX_PHOTOS_PER_ASSET,
  newStorageKey, optimizePhoto, savePhoto, removeNewPhoto,
} = require('../../services/localPhotoStorage');

async function uploadAssetPhoto(req, res) {
  const assetId = Number(req.params.assetId);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    return res.status(400).json({ error: 'Valid assetId required.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Upload one photo in the "photo" field.' });
  const caption = req.body.caption === undefined ? null : String(req.body.caption).trim();
  if (caption !== null && caption.length > 255) {
    return res.status(400).json({ error: 'Caption must not exceed 255 characters.' });
  }
  if (req.body.isPrimary !== undefined && !['true', 'false'].includes(req.body.isPrimary)) {
    return res.status(400).json({ error: 'isPrimary must be "true" or "false".' });
  }

  let optimized;
  try { optimized = await optimizePhoto(req.file.buffer); }
  catch (err) { return res.status(err.status || 400).json({ error: err.message }); }

  let client;
  let storageKey;
  let saved = false;
  let committed = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Serializes concurrent uploads and primary selection for the same asset.
    const asset = await client.query('SELECT asset_id FROM assets WHERE asset_id = $1 FOR UPDATE', [assetId]);
    if (!asset.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Asset not found.' });
    }
    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM asset_photos WHERE asset_id = $1', [assetId]);
    const count = countResult.rows[0].count;
    if (count >= MAX_PHOTOS_PER_ASSET) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Maximum ${MAX_PHOTOS_PER_ASSET} photos per asset.` });
    }
    const isPrimary = count === 0 || req.body.isPrimary === 'true';
    storageKey = newStorageKey(assetId);
    await savePhoto(storageKey, assetId, optimized);
    saved = true;
    // Photo ID becomes available after insertion; then set its authenticated URL.
    const record = await addPhoto(client, {
      assetId, imageUrl: 'local:pending', storageKey,
      caption: caption || null, isPrimary, uploadedBy: req.user.userId,
    });
    const imageUrl = `/api/assets/${assetId}/photos/${record.photoId}/file`;
    await client.query('UPDATE asset_photos SET image_url = $1 WHERE asset_photo_id = $2', [imageUrl, record.photoId]);
    if (record.oldPrimaryPhotoId) {
      await writeAudit(client, req.user.userId, 'asset_photos', record.oldPrimaryPhotoId, AUDIT_ACTION.UPDATE);
    }
    await writeAudit(client, req.user.userId, 'asset_photos', record.photoId, AUDIT_ACTION.CREATE);
    await client.query('COMMIT');
    committed = true;
    return res.status(201).json({
      message: 'Asset photo uploaded successfully.', assetId,
      photoId: record.photoId, imageUrl, isPrimary,
    });
  } catch (err) {
    if (client && !committed) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Photo upload rollback failed:', rollbackError); }
    }
    if (saved && !committed) {
      try { await removeNewPhoto(storageKey, assetId); }
      catch (cleanupError) { console.error('Photo upload cleanup failed:', cleanupError); }
    }
    console.error('Upload asset photo error:', err);
    return res.status(500).json({ error: 'Failed to upload asset photo.' });
  } finally {
    if (client) client.release();
  }
}

module.exports = uploadAssetPhoto;
