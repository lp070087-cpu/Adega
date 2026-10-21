import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorage, validateUploadBytes } from '../src/lib/storage';
test('upload checks real file signatures, disallows SVG and rejects MIME mismatch', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.doesNotThrow(() => validateUploadBytes(png, 'image/png'));
  assert.throws(() => validateUploadBytes(png, 'image/jpeg'));
  assert.throws(() => validateUploadBytes(Buffer.from('<svg/>'), 'image/svg+xml'));
  assert.throws(() => validateUploadBytes(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png'));
});
test('Cloudinary is configured only when every server credential exists', () => {
  const keys = ['STORAGE_PROVIDER', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const previous = keys.map(k => process.env[k]);
  try {
    process.env.STORAGE_PROVIDER = 'cloudinary';
    delete process.env.CLOUDINARY_API_SECRET;
    assert.equal(getStorage().isConfigured(), false);
  } finally { keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; }); }
});
