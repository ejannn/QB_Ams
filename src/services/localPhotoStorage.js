// QRBAMS-local asset-photo storage. Never expose this directory as express.static.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS_PER_ASSET = 5;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const STORAGE_KEY_RE = /^(\d+)\/([0-9a-f-]{36}\.webp)$/i;
const PENDING_SUFFIX_RE = /^(?<filename>[0-9a-f-]{36}\.webp)\.pending-delete-(?<token>[0-9a-f-]{36})$/i;

// Default is a sibling of the backend repository, NOT part of the repository.
// On Windows Server set ASSET_PHOTO_DIR to an absolute dedicated data path.
function storageRoot() {
  const configured = process.env.ASSET_PHOTO_DIR;
  if (configured && !path.isAbsolute(configured)) {
    throw new Error('ASSET_PHOTO_DIR must be an absolute path.');
  }
  return path.resolve(configured || path.join(process.cwd(), '..', 'QRBAMS-DATA', 'asset-photos'));
}

function validateStorageKey(key, assetId) {
  const match = typeof key === 'string' ? STORAGE_KEY_RE.exec(key) : null;
  if (!match || String(Number(match[1])) !== String(Number(assetId))) {
    throw new Error('Invalid local photo storage key.');
  }
  return match;
}

function pathForKey(key, assetId) {
  const match = validateStorageKey(key, assetId);
  return path.join(storageRoot(), match[1], match[2]);
}

function newStorageKey(assetId) {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new Error('Invalid asset ID.');
  }
  return `${assetId}/${randomUUID()}.webp`;
}

async function optimizePhoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    const err = new Error('Photo must be between 1 byte and 5 MB.');
    err.status = 413;
    throw err;
  }
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false }).metadata();
  } catch (_) {
    const err = new Error('Invalid or oversized image. Upload JPEG, PNG, or WebP.');
    err.status = 400;
    throw err;
  }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) ||
      !metadata.width || !metadata.height ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages || 1) > 1) {
    const err = new Error('Only still JPEG, PNG, and WebP images up to 25 megapixels are supported.');
    err.status = 400;
    throw err;
  }
  // rotate() applies orientation; sharp strips EXIF/GPS metadata by default.
  const output = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  if (output.length > MAX_OUTPUT_BYTES) {
    const err = new Error('Optimized image is too large; please choose a smaller photo.');
    err.status = 413;
    throw err;
  }
  return output;
}

async function savePhoto(key, assetId, buffer) {
  const target = pathForKey(key, assetId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { flag: 'wx' });
  return target;
}

async function removeNewPhoto(key, assetId) {
  if (!key) return;
  try { await fs.unlink(pathForKey(key, assetId)); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
}

async function loadPhoto(key, assetId) {
  // DB-sourced key is validated, and only WebP created by this service is served.
  return fs.readFile(pathForKey(key, assetId));
}

async function stageForDeletion(key, assetId) {
  const original = pathForKey(key, assetId);
  const staged = `${original}.pending-delete-${randomUUID()}`;
  await fs.rename(original, staged);
  return { original, staged };
}

async function restoreStagedDeletion(stage) {
  if (stage) await fs.rename(stage.staged, stage.original);
}

async function finishStagedDeletion(stage) {
  if (stage) await fs.unlink(stage.staged);
}

// Handles a process crash between staging and committing a deletion:
// if the DB record survived, restore the file; otherwise permanently unlink it.
async function reconcilePendingDeletions(pool) {
  const root = storageRoot();
  let directories;
  try { directories = await fs.readdir(root, { withFileTypes: true }); }
  catch (err) { if (err.code === 'ENOENT') return; throw err; }
  for (const dir of directories) {
    if (!dir.isDirectory() || !/^[1-9]\d*$/.test(dir.name)) continue;
    const assetId = Number(dir.name);
    if (!Number.isSafeInteger(assetId)) continue;
    const folder = path.join(root, dir.name);
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = PENDING_SUFFIX_RE.exec(entry.name);
      if (!match) continue;
      const key = `${assetId}/${match.groups.filename}`;
      const original = path.join(folder, match.groups.filename);
      const staged = path.join(folder, entry.name);
      const { rows } = await pool.query(
        'SELECT 1 FROM asset_photos WHERE asset_id = $1 AND storage_key = $2 LIMIT 1',
        [assetId, key]
      );
      if (rows.length) {
        // Never overwrite an existing file during reconciliation.
        try { await fs.access(original); console.warn('Photo recovery conflict:', key); }
        catch (err) { if (err.code !== 'ENOENT') throw err; await fs.rename(staged, original); }
      } else {
        await fs.unlink(staged);
      }
    }
  }
}

module.exports = {
  MAX_UPLOAD_BYTES,
  MAX_PHOTOS_PER_ASSET,
  newStorageKey,
  optimizePhoto,
  savePhoto,
  removeNewPhoto,
  loadPhoto,
  stageForDeletion,
  restoreStagedDeletion,
  finishStagedDeletion,
  reconcilePendingDeletions,
};
