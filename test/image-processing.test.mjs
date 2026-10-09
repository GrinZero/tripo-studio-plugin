import assert from 'node:assert/strict';
import { it } from 'node:test';
import { convertImage, decodePixels, encodePixels, imageMetadata } from '../src/util/image-processing.mjs';
import { inspectImageBytes } from '../src/util/image.mjs';
import { solidImage } from './helpers/image-fixture.mjs';

// Independent PNG fixture: two RGBA pixels, red at alpha 128 and opaque green.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DQwPCf4T8ADn0Dfur2k8AAAAAASUVORK5CYII=', 'base64');
const rgba = Buffer.from([255, 0, 0, 128, 0, 255, 0, 255]);

it('decodes an independent RGBA PNG and preserves pixels through PNG and lossless WebP', async () => {
  assert.deepEqual((await decodePixels(png)).data, rgba);
  for (const format of ['png', 'webp']) {
    const bytes = await encodePixels(rgba, { width: 2, height: 1 }, { format, lossless: true });
    assert.deepEqual((await decodePixels(bytes)).data, rgba);
    const metadata = await imageMetadata(bytes);
    assert.equal(metadata.format, format);
    assert.equal(metadata.hasAlpha, true);
  }
});

it('crops a copy and flattens alpha over the requested background', async () => {
  const before = Buffer.from(png);
  const crop = await convertImage(png, { crop: { left: 1, top: 0, width: 1, height: 1 } });
  assert.deepEqual((await decodePixels(crop)).data, rgba.subarray(4));
  const flattened = await convertImage(png, { background: '#ffffff', format: 'webp', lossless: true });
  assert.deepEqual((await decodePixels(flattened)).data, Buffer.from([255, 127, 127, 255, 0, 255, 0, 255]));
  assert.deepEqual(png, before);
  await assert.rejects(() => convertImage(png, { crop: { left: 1, top: 0, width: 2, height: 1 } }), /outside/);
});

it('keeps encoding and aspect ratio when shrinking PNG, JPEG and WebP, without enlarging', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const source = await solidImage({ width: 80, height: 40, background: '#628c61' }, { format, lossless: true });
    const small = await convertImage(source, { format, maxSize: 20, quality: 95, lossless: true });
    const metadata = await imageMetadata(small);
    assert.equal(metadata.format, format);
    assert.equal(metadata.width, 20);
    assert.equal(metadata.height, 10);
    // Data textures must not gain a gamma/color-space conversion on resize.
    const { data } = await decodePixels(small);
    for (const [i, value] of [98, 140, 97].entries()) assert.ok(Math.abs(data[i] - value) <= 2);
    const again = await convertImage(small, { format, maxSize: 80 });
    assert.equal((await imageMetadata(again)).width, 20);
  }
});

it('reads VP8X canvas dimensions and preserves JPEG EXIF orientation during import', async () => {
  const webp = await convertImage(png, { format: 'webp', quality: 82 });
  assert.equal(webp.toString('ascii', 12, 16), 'VP8X');
  assert.deepEqual(inspectImageBytes(webp), { format: 'webp', width: 2, height: 1 });
  const jpeg = await solidImage({ width: 8, height: 4 }, { format: 'jpeg' });
  // EXIF little-endian IFD with orientation 6 (90 degrees clockwise).
  const exif = Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000', 'hex');
  const marker = Buffer.alloc(4); marker.writeUInt16BE(0xffe1); marker.writeUInt16BE(exif.length + 2, 2);
  const rotated = await convertImage(Buffer.concat([jpeg.subarray(0, 2), marker, exif, jpeg.subarray(2)]), { autoOrient: true });
  assert.equal((await imageMetadata(rotated)).width, 4);
  assert.equal((await imageMetadata(rotated)).height, 8);
});

it('rejects unsupported, animated and oversized inputs before allocating pixels', async () => {
  await assert.rejects(() => convertImage(Buffer.from('<svg/>')), /Only real PNG/);
  const huge = Buffer.from(png); huge.writeUInt32BE(16384, 16); huge.writeUInt32BE(8192, 20);
  await assert.rejects(() => convertImage(huge), /dimensions/);
  const webp = await convertImage(png, { format: 'webp' });
  webp[20] |= 2;
  await assert.rejects(() => convertImage(webp), /animated/);
  await assert.rejects(() => encodePixels(Buffer.alloc(3), { width: 2, height: 1 }), /Invalid RGB/);
});
