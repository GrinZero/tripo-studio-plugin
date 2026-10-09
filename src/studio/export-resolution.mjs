import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { convertImage, imageMetadata } from '../util/image-processing.mjs';
import { unzipSync, zipSync } from 'fflate';
import { TripoError } from '../errors.mjs';
import { downloadArtifact } from './downloader.mjs';
import { resolveOutputPath } from '../security/path-policy.mjs';

const MAX_BYTES = 512 * 1024 * 1024;
const imageName = /\.(png|jpe?g|webp)$/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function reject(message) { throw new TripoError('EXPORT_RESOLUTION_UNVERIFIED', message, { stage: 'export_resolution' }); }
const aligned = bytes => { const out = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(out); return out; };

function parseGlb(bytes) {
  if (bytes.length < 28 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) reject('Invalid GLB export.');
  const size = bytes.readUInt32LE(12), end = 20 + size;
  if (size % 4 || end + 8 > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(end + 4) !== 0x004e4942 || end + 8 + bytes.readUInt32LE(end) !== bytes.length) reject('Unsupported GLB chunk layout.');
  const doc = JSON.parse(bytes.subarray(20, end).toString('utf8').trim());
  const bin = bytes.subarray(end + 8);
  if (!doc.buffers?.length || doc.buffers[0].uri || doc.buffers[0].byteLength > bin.length || doc.buffers.slice(1).some(b => b.uri || b.extensions?.EXT_meshopt_compression?.fallback !== true)) reject('GLB must use an embedded primary buffer and optional meshopt fallback buffers.');
  return { doc, bin };
}
function imageBytes(doc, bin, image) {
  if (image.uri) {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image.uri);
    if (!match) reject('External or unsupported GLB image URI; export a self-contained model.');
    return Buffer.from(match[1], 'base64');
  }
  const view = doc.bufferViews?.[image.bufferView], start = view?.byteOffset ?? 0;
  if (!view || view.buffer !== 0 || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength <= 0 || start + view.byteLength > bin.length) reject('GLB image buffer view is invalid.');
  return bin.subarray(start, start + view.byteLength);
}
export async function inspectGlbTextures(bytes) {
  const { doc, bin } = parseGlb(bytes);
  return Promise.all((doc.images ?? []).map(async (image, i) => {
    const m = await imageMetadata(imageBytes(doc, bin, image));
    return { name: image.name ?? `image-${i}`, width: m.width, height: m.height };
  }));
}
async function resizeImage(bytes, size, name) {
  const m = await imageMetadata(bytes);
  if (!m.width || !m.height || m.pages > 1 || !['png', 'jpeg', 'webp'].includes(m.format)) reject(`Unsupported texture encoding: ${name}.`);
  const changed = Math.max(m.width, m.height) > size;
  // Resolution is a maximum edge length: preserve aspect ratio and never upscale.
  let output = bytes;
  if (changed) {
    // Keep filenames, encoding and alpha; do not convert PBR data maps to sRGB.
    output = await convertImage(bytes, { maxSize: size, format: m.format, quality: 95, lossless: true });
  }
  const actual = await imageMetadata(output);
  if (Math.max(actual.width, actual.height) > size) reject(`Texture still exceeds requested resolution: ${name}.`);
  return { bytes: output, changed, texture: { name, source_width: m.width, source_height: m.height, width: actual.width, height: actual.height } };
}
async function resizeGlb(bytes, size, prefix) {
  const { doc, bin } = parseGlb(bytes);
  const parts = [aligned(bin)], textures = [];
  let offset = parts[0].length, changed = false;
  for (const [i, image] of (doc.images ?? []).entries()) {
    const result = await resizeImage(imageBytes(doc, bin, image), size, `${prefix}#${image.name ?? i}`);
    textures.push(result.texture);
    if (!result.changed) continue;
    changed = true;
    if (image.uri) image.uri = `${image.uri.slice(0, image.uri.indexOf(',') + 1)}${result.bytes.toString('base64')}`;
    else {
      // Append image-only views; every geometry, skin and animation buffer remains byte-identical.
      doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: result.bytes.length });
      image.bufferView = doc.bufferViews.length - 1;
      const padded = aligned(result.bytes); parts.push(padded); offset += padded.length;
    }
  }
  if (!changed) return { bytes, changed, textures };
  const binary = Buffer.concat(parts); doc.buffers[0].byteLength = binary.length;
  const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const out = Buffer.alloc(28 + padded.length + binary.length);
  out.write('glTF'); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12); out.writeUInt32LE(0x4e4f534a, 16); padded.copy(out, 20);
  const b = 20 + padded.length; out.writeUInt32LE(binary.length, b); out.writeUInt32LE(0x004e4942, b + 4); binary.copy(out, b + 8);
  return { bytes: out, changed, textures };
}
function boundedZip(bytes) {
  // Inspect declared expansion before allocating; never extract paths onto disk.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) reject('Invalid or multi-volume export ZIP.');
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16), total = 0;
  if (count > 1024 || offset + centralSize !== end) reject('Export archive exceeds supported bounds.');
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50 || bytes.readUInt16LE(offset + 8) & 1) reject('Invalid or encrypted export ZIP entry.');
    total += bytes.readUInt32LE(offset + 24);
    const length = bytes.readUInt16LE(offset + 28), name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8');
    if (total > MAX_BYTES || !name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || name.split('/').includes('..') || names.has(name)) reject('Unsafe or oversized export ZIP.');
    names.add(name); offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  if (offset !== end) reject('Invalid ZIP central directory.');
  return unzipSync(bytes);
}
export async function normalizeExport(bytes, { textureSize, format, expectTextures = false }) {
  if (bytes.length > MAX_BYTES) reject('Export resolution processing currently supports files up to 512 MiB.');
  let result;
  if (bytes.toString('ascii', 0, 4) === 'glTF') result = await resizeGlb(bytes, textureSize, 'model.glb');
  else if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) {
    const files = boundedZip(bytes), textures = []; let changed = false;
    for (const [name, data] of Object.entries(files)) {
      let item;
      if (imageName.test(name)) { item = await resizeImage(Buffer.from(data), textureSize, name); textures.push(item.texture); }
      else if (/\.glb$/i.test(name)) { item = await resizeGlb(Buffer.from(data), textureSize, name); textures.push(...item.textures); }
      if (item?.changed) { files[name] = item.bytes; changed = true; }
    }
    if (changed && format === 'usdz') reject('USDZ texture resizing needs an aligned USDZ writer; use GLB or ZIP FBX/OBJ for verified resolution.');
    result = { bytes: changed ? Buffer.from(zipSync(files, { level: 6, mtime: new Date(1980, 0, 1) })) : bytes, changed, textures };
  } else result = { bytes, changed: false, textures: [] };
  if (expectTextures && !result.textures.length && format !== 'stl') reject('Textured export has no inspectable images. Use self-contained GLB or ZIP FBX/OBJ instead of embedded FBX.');
  return { ...result, verification: { requested_texture_size: textureSize, actual_texture_size_verified: result.textures.length > 0, resolution_status: result.textures.length ? 'verified' : 'not_applicable', resolution_method: result.changed ? 'local_downsample' : 'remote_verified', textures: result.textures, source_sha256: hash(bytes), output_sha256: hash(result.bytes) } };
}
export async function sourceTextureInfo(ctx, detail, operatorId) {
  if (!detail.model_url) return { source_texture_size: detail.operator?.is_ultra_textured ? 8192 : detail.operator?.is_hd_textured ? 4096 : 2048, source_texture_size_verified: false };
  const root = path.join(ctx.config.dataDir, 'export-input-cache');
  const file = await resolveOutputPath({ ...ctx.config, outputRoots: [root] }, path.join(root, `${hash(Buffer.from(operatorId))}.glb`), 'source.glb');
  let bytes;
  try { bytes = await readFile(file); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    await downloadArtifact({ ...ctx.config, outputRoots: [root] }, detail.model_url, file, 'source.glb');
    bytes = await readFile(file);
  }
  // Operator IDs are immutable model versions; a validated cached source avoids
  // repeatedly fetching the same multi-megabyte file during staging.
  const textures = await inspectGlbTextures(bytes);
  return { source_texture_size: textures.length ? Math.max(...textures.map(t => Math.max(t.width, t.height))) : 2048, source_texture_size_verified: true, source_texture_count: textures.length };
}
export async function prepareExportDownload(runtime, record) {
  const { config, gateway } = runtime;
  const root = path.join(config.assetRoot, 'exports', record.task_id);
  const raw = await resolveOutputPath(config, path.join(root, `download-${randomUUID()}.tmp`), 'source.bin');
  await mkdir(path.dirname(raw), { recursive: true });
  // Always use the frozen export operator, never the project's current model.
  const url = record.remote?.operator_id ? (await gateway.getExportDownload(record.remote.operator_id, record.payload.name)).model_url : record.result.export_url;
  await downloadArtifact(config, url, raw, 'source.bin');
  const bytes = await readFile(raw);
  const source = await resolveOutputPath(config, path.join(root, `${hash(bytes)}.source.bin`), 'source.bin');
  await writeImmutable(source, bytes); await unlink(raw);
  const result = await normalizeExport(bytes, { textureSize: record.payload.texture_size, format: record.result.format, expectTextures: record.metadata.source_texture_count > 0 });
  const zip = result.bytes.length >= 4 && result.bytes.readUInt32LE(0) === 0x04034b50;
  const name = `${record.payload.name}.${zip ? 'zip' : record.result.format}`;
  const target = await resolveOutputPath(config, path.join(root, `${hash(result.bytes)}.${zip ? 'zip' : record.result.format}`), name);
  await writeImmutable(target, result.bytes);
  return { localPath: target, defaultName: name, verification: { ...result.verification, source_path: source }, source: { task_id: record.task_id } };
}

async function writeImmutable(target, bytes) {
  try { await writeFile(target, bytes, { flag: 'wx' }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; if (hash(await readFile(target)) !== hash(bytes)) reject('Cached export artifact changed; refusing to overwrite it.'); }
}
