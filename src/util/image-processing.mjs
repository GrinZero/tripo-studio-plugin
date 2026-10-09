import { readFile } from 'node:fs/promises';
import {
  initializeImageMagick, ImageMagick, MagickImage, MagickFormat,
  MagickGeometry, MagickReadSettings, MagickColor, AlphaAction, ResourceLimits
} from '@imagemagick/magick-wasm';
import { inspectImageBytes } from './image.mjs';

const formats = { png: MagickFormat.Png, jpeg: MagickFormat.Jpeg, webp: MagickFormat.WebP };
const MAX_PIXELS = 64 * 1024 * 1024;
let initialization;

// Production uses the WASM shipped alongside server.mjs; source development
// uses the exact npm version. Initialization is lazy and shared by all callers.
async function initialize() {
  initialization ??= (async () => {
    let wasm;
    try { wasm = await readFile(new URL('./magick.wasm', import.meta.url)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      wasm = await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')));
    }
    await initializeImageMagick(wasm);
    ResourceLimits.width = 16384n;
    ResourceLimits.height = 16384n;
    ResourceLimits.memory = 1024n * 1024n * 1024n;
    ResourceLimits.disk = 0n;
  })();
  await initialization;
}

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > MAX_PIXELS) {
    throw new Error('Image exceeds the supported dimensions or 64 megapixel limit.');
  }
}

async function inputBytes(input) {
  const bytes = typeof input === 'string' ? await readFile(input) : Buffer.from(input);
  // Validate the container and reject animations before allocating pixels.
  const metadata = inspectImageBytes(bytes);
  dimensions(metadata.width, metadata.height);
  return { bytes, metadata };
}

export async function imageMetadata(input) {
  const { bytes, metadata } = await inputBytes(input);
  await initialize();
  const image = MagickImage.create();
  try {
    image.ping(bytes, new MagickReadSettings({ format: formats[metadata.format] }));
    return { ...metadata, hasAlpha: image.hasAlpha, pages: 1 };
  } finally { image.dispose(); }
}

function transform(image, { autoOrient = false, maxSize, crop, background } = {}) {
  if (autoOrient) image.autoOrient();
  if (crop) {
    const { left, top, width, height } = crop;
    dimensions(width, height);
    if (![left, top].every(n => Number.isInteger(n) && n >= 0) || left + width > image.width || top + height > image.height) throw new Error('Crop rectangle is outside the image.');
    image.crop(new MagickGeometry(left, top, width, height));
    image.resetPage();
  }
  if (maxSize) {
    const scale = Math.min(1, maxSize / image.width, maxSize / image.height);
    if (scale < 1) {
      const geometry = new MagickGeometry(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
      geometry.ignoreAspectRatio = true;
      image.resize(geometry);
    }
  }
  if (background) {
    image.backgroundColor = new MagickColor(background);
    image.alpha(AlphaAction.Remove);
  }
}

function encode(image, { format = 'png', quality = 85, lossless = false } = {}) {
  if (!formats[format]) throw new Error(`Unsupported output image format: ${format}`);
  image.depth = 8;
  image.quality = quality;
  if (format === 'webp') image.settings.setDefine(MagickFormat.WebP, 'lossless', lossless);
  if (format === 'jpeg') image.settings.setDefine(MagickFormat.Jpeg, 'sampling-factor', '4:4:4');
  // Repeated export processing must produce identical bytes.
  if (format === 'png') image.settings.setDefine(MagickFormat.Png, 'exclude-chunks', 'date,time');
  return image.write(formats[format], bytes => Buffer.from(bytes));
}

export async function convertImage(input, options = {}) {
  const { bytes, metadata } = await inputBytes(input);
  await initialize();
  return ImageMagick.read(bytes, new MagickReadSettings({ format: formats[metadata.format] }), image => {
    transform(image, options);
    return encode(image, options);
  });
}

export async function decodePixels(input, options = {}) {
  const { bytes, metadata } = await inputBytes(input);
  await initialize();
  return ImageMagick.read(bytes, new MagickReadSettings({ format: formats[metadata.format] }), image => {
    transform(image, options);
    const channels = options.channels ?? 4;
    if (![3, 4].includes(channels)) throw new Error('Only RGB and RGBA pixels are supported.');
    const data = image.getPixels(pixels => Buffer.from(pixels.toByteArray(0, 0, image.width, image.height, channels === 4 ? 'RGBA' : 'RGB')));
    return { data, info: { width: image.width, height: image.height, channels } };
  });
}

export async function encodePixels(data, { width, height, channels = 4 }, options = {}) {
  dimensions(width, height);
  if (![3, 4].includes(channels) || data.length !== width * height * channels) throw new Error('Invalid RGB/RGBA pixel buffer.');
  await initialize();
  const settings = new MagickReadSettings({ width, height, depth: 8, format: channels === 4 ? MagickFormat.Rgba : MagickFormat.Rgb });
  return ImageMagick.read(data, settings, image => encode(image, options));
}
