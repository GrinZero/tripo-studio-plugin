import { encodePixels } from '../../src/util/image-processing.mjs';

export async function solidImage({ width, height, background = '#cc7755', channels = 4 }, options = {}) {
  const color = typeof background === 'string'
    ? [1, 3, 5].map(offset => Number.parseInt(background.slice(offset, offset + 2), 16))
    : [background.r, background.g, background.b];
  if (channels === 4) color.push(Math.round((typeof background === 'string' ? 1 : background.alpha ?? 1) * 255));
  const pixels = Buffer.alloc(width * height * channels);
  for (let offset = 0; offset < pixels.length; offset += channels) pixels.set(color, offset);
  return encodePixels(pixels, { width, height, channels }, options);
}
