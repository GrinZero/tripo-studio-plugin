import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { MAX_IMPORT_MODEL_BYTES } from "../constants.mjs";
import { TripoError } from "../errors.mjs";
import { resolveOutputPath } from "../security/path-policy.mjs";

const invalid = message => new TripoError("FILE_INVALID", message, { stage: "model_decode" });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Decode only: retain accessors, images, materials, skins and animations as-is.
// The preview and Blender paths share this decoder, with separate size limits.
export async function decodeMeshoptGlb(bytes, maxBytes = MAX_IMPORT_MODEL_BYTES) {
  if (bytes.length < 28 || bytes.length > maxBytes || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw invalid("Invalid or oversized GLB v2 file.");
  let json, binary, offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw invalid("Truncated GLB chunk header.");
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) throw invalid("Truncated or misaligned GLB chunk.");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 12 && type !== 0x4e4f534a) throw invalid("GLB must start with a JSON chunk.");
    if (type === 0x4e4f534a) {
      if (json) throw invalid("Duplicate GLB JSON chunk.");
      try { json = JSON.parse(chunk.toString("utf8").replace(/[\u0000\u0020]+$/g, "")); }
      catch { throw invalid("Invalid GLB JSON."); }
    } else if (type === 0x004e4942) {
      if (binary) throw invalid("Duplicate GLB binary chunk.");
      binary = chunk;
    }
    offset += 8 + length;
  }
  if (!json) throw invalid("GLB has no JSON document.");
  if (!json.bufferViews?.some(v => v.extensions?.EXT_meshopt_compression)) return bytes;
  if (!binary || !json.buffers?.length || json.buffers[0].uri || json.buffers[0].byteLength > binary.length || json.buffers.slice(1).some(b => b.uri || b.extensions?.EXT_meshopt_compression?.fallback !== true)) throw invalid("Meshopt decoding requires an embedded buffer and optional virtual fallback buffers.");
  if (json.images?.some(i => i.uri && !i.uri.startsWith("data:"))) throw invalid("External GLB images are not supported.");
  await MeshoptDecoder.ready;
  const chunks = [binary]; let total = binary.length;
  for (const view of json.bufferViews) {
    const extension = view.extensions?.EXT_meshopt_compression;
    if (!extension) {
      if (view.buffer !== 0 || !integer(view.byteOffset ?? 0) || !integer(view.byteLength) || (view.byteOffset ?? 0) + view.byteLength > binary.length) throw invalid("Invalid embedded GLB buffer view.");
      continue;
    }
    const start = extension.byteOffset ?? 0;
    const length = extension.count * extension.byteStride;
    const paddedLength = Math.ceil(length / 4) * 4;
    if (extension.buffer !== 0 || !integer(extension.count) || !integer(extension.byteStride) || !extension.byteStride || !integer(start) || !integer(extension.byteLength) || start + extension.byteLength > binary.length || !integer(length) || total + paddedLength > maxBytes) throw invalid("Invalid or oversized Meshopt buffer view.");
    const decoded = Buffer.alloc(length);
    try { MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride, binary.subarray(start, start + extension.byteLength), extension.mode, extension.filter ?? "NONE"); }
    catch { throw invalid("Could not decode the Meshopt geometry."); }
    view.buffer = 0; view.byteOffset = total; view.byteLength = length;
    delete view.extensions.EXT_meshopt_compression;
    if (!Object.keys(view.extensions).length) delete view.extensions;
    chunks.push(decoded, Buffer.alloc(paddedLength - length)); total += paddedLength;
  }
  json.buffers = [{ byteLength: total }];
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (json[key]) { json[key] = json[key].filter(name => name !== "EXT_meshopt_compression"); if (!json[key].length) delete json[key]; }
  }
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.alloc(Math.ceil(rawJson.length / 4) * 4, 32); rawJson.copy(jsonBytes);
  if (28 + jsonBytes.length + total > maxBytes) throw invalid("Decoded GLB exceeds the model size limit.");
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBytes.length + total, 8);
  header.writeUInt32LE(jsonBytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(total); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonBytes, binHeader, ...chunks]);
}

export async function prepareGlbForBlender(config, sourcePath) {
  if ((await stat(sourcePath)).size > MAX_IMPORT_MODEL_BYTES) throw invalid("GLB exceeds the 150 MiB local model limit.");
  const source = await readFile(sourcePath);
  const decoded = await decodeMeshoptGlb(source);
  const sourceHash = hash(source), decodedHash = decoded === source ? sourceHash : hash(decoded);
  let target = sourcePath;
  if (decoded !== source) {
    const parsed = path.parse(sourcePath);
    target = await resolveOutputPath(config, path.join(parsed.dir, `${parsed.name}.decoded-${sourceHash.slice(0, 12)}.glb`), "decoded.glb");
    try { await writeFile(target, decoded, { flag: "wx", mode: 0o400 }); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (hash(await readFile(target)) !== decodedHash) throw invalid("The retained decoded GLB changed; refusing to overwrite it.");
    }
  }
  return { blender_path: target, meshopt_decoded: decoded !== source, source_sha256: sourceHash, blender_sha256: decodedHash, blender_bytes: decoded.length };
}
