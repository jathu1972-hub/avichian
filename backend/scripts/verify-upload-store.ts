import { storeUpload, validateUploadFile } from '../src/services/storage.service.js';
import { existsSync } from 'fs';
import { join } from 'path';

validateUploadFile({ purpose: 'story_image', mimeType: 'image/png', size: 1000 });
console.log('png ok');

try {
  validateUploadFile({ purpose: 'story_image', mimeType: 'image/gif', size: 1000 });
  console.log('FAIL: gif should be rejected');
  process.exit(1);
} catch (e) {
  console.log('gif rejected:', (e as Error).message);
}

const buf = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const r = await storeUpload({
  purpose: 'story_image',
  buffer: buf,
  mimeType: 'image/png',
  userId: 'test-user',
});
console.log('stored', r);
const localPath = join(process.cwd(), 'uploads', r.key);
console.log('file exists', existsSync(localPath), localPath);
console.log('PASS upload store');
