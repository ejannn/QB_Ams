const pool = require('../../db/pool');
const { writeAudit, AUDIT_ACTION } = require('../../utils/audit');
const { deletePhoto } = require('../../services/assetPhotoService');
const {
  stageForDeletion, restoreStagedDeletion, finishStagedDeletion,
} = require('../../services/localPhotoStorage');

async function deleteAssetPhoto(req, res) {
  const assetId = Number(req.params.assetId);
  const photoId = Number(req.params.photoId);
  if (![assetId, photoId].every(n => Number.isSafeInteger(n) && n > 0)) {
    return res.status(400).json({ error: 'Valid assetId and photoId required.' });
  }
  let client;
  let stage = null;
  let committed = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const asset = await client.query('SELECT asset_id FROM assets WHERE asset_id = $1 FOR UPDATE', [assetId]);
    if (!asset.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Asset not found.' });
    }
    const existing = await client.query(
      'SELECT storage_key FROM asset_photos WHERE asset_id = $1 AND asset_photo_id = $2 FOR UPDATE',
      [assetId, photoId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Photo not found for this asset.' });
    }
    if (existing.rows[0].storage_key) {
      // Stage on the SAME volume before commit; no Recycle Bin or application trash.
      stage = await stageForDeletion(existing.rows[0].storage_key, assetId);
    }
    const result = await deletePhoto(client, { assetId, photoId });
    await writeAudit(client, req.user.userId, 'asset_photos', photoId, AUDIT_ACTION.DELETE);
    if (result.promotedPhotoId) {
      await writeAudit(client, req.user.userId, 'asset_photos', result.promotedPhotoId, AUDIT_ACTION.UPDATE);
    }
    await client.query('COMMIT');
    committed = true;
    if (stage) {
      try { await finishStagedDeletion(stage); }
      catch (cleanupError) {
        console.error('Photo metadata deleted, but permanent file cleanup failed:', cleanupError);
        return res.status(500).json({
          error: 'Photo record was deleted, but file cleanup is incomplete. Contact the administrator.',
          assetId, photoId,
        });
      }
    }
    return res.json({
      message: 'Asset photo permanently deleted from active storage.',
      assetId, photoId, wasPrimary: result.wasPrimary,
      promotedPhotoId: result.promotedPhotoId,
    });
  } catch (err) {
    if (client && !committed) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) { console.error('Photo delete rollback failed:', rollbackError); }
      if (stage) {
        try { await restoreStagedDeletion(stage); }
        catch (restoreError) { console.error('Photo delete restore failed; check storage manually:', restoreError); }
      }
    }
    console.error('Delete asset photo error:', err);
    return res.status(500).json({ error: 'Unable to delete photo. Check storage permissions and try again.' });
  } finally {
    if (client) client.release();
  }
}

module.exports = deleteAssetPhoto;
