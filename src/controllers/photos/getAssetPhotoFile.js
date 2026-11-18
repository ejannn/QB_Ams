const pool = require('../../db/pool');
const { loadPhoto } = require('../../services/localPhotoStorage');

async function getAssetPhotoFile(req, res) {
  const assetId = Number(req.params.assetId);
  const photoId = Number(req.params.photoId);
  if (![assetId, photoId].every(id => Number.isSafeInteger(id) && id > 0)) {
    return res.status(400).json({ error: 'Valid assetId and photoId required.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT storage_key FROM asset_photos WHERE asset_id = $1 AND asset_photo_id = $2',
      [assetId, photoId]
    );
    if (!rows.length || !rows[0].storage_key) return res.status(404).json({ error: 'Local photo not found.' });
    const bytes = await loadPhoto(rows[0].storage_key, assetId);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.type('webp').send(bytes);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Photo file missing from storage.' });
    console.error('Read asset photo error:', err);
    return res.status(500).json({ error: 'Unable to retrieve asset photo.' });
  }
}

module.exports = getAssetPhotoFile;
