// Dependency + local filesystem smoke tests. Does NOT access PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'qrbams-photo-test-'));
  process.env.ASSET_PHOTO_DIR = folder;
  const storage = require('../src/services/localPhotoStorage');
  const assetId = 1234567;
  try {
    const png = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#aabbcc' } }).png().toBuffer();
    const webp = await storage.optimizePhoto(png);
    assert.equal((await sharp(webp).metadata()).format, 'webp');
    assert.ok(webp.length > 0 && webp.length <= 3 * 1024 * 1024);
    const key = storage.newStorageKey(assetId);
    assert.match(key, /^1234567\/[0-9a-f-]{36}\.webp$/);
    await assert.rejects(() => storage.loadPhoto('../escape.webp', assetId));
    await storage.savePhoto(key, assetId, webp);
    assert.deepEqual(await storage.loadPhoto(key, assetId), webp);
    const staged = await storage.stageForDeletion(key, assetId);
    await storage.reconcilePendingDeletions({ query: async () => ({ rows: [{ exists: 1 }] }) });
    assert.deepEqual(await storage.loadPhoto(key, assetId), webp);
    const staged2 = await storage.stageForDeletion(key, assetId);
    await storage.reconcilePendingDeletions({ query: async () => ({ rows: [] }) });
    await assert.rejects(() => fs.access(staged2.staged), { code: 'ENOENT' });
    await assert.rejects(() => storage.loadPhoto(key, assetId), { code: 'ENOENT' });
    console.log('Photo storage self-test passed (WebP, validation, save, read, pending-delete recovery, delete).');
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
