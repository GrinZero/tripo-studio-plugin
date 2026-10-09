import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { TripoError } from "../errors.mjs";
import { MAX_IMAGE_BYTES } from "../constants.mjs";

const MAX_DIMENSION = 16384;
const MAX_PIXELS = 1e8;

function detectImageFormat(bytes) {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  return undefined;
}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

function pngDimensions(bytes) {
  let offset = 8;
  let dimensions;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("PNG chunk exceeds file bounds");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) throw new Error("PNG IHDR is invalid");
      dimensions = { height: bytes.readUInt32BE(offset + 12), width: bytes.readUInt32BE(offset + 8) };
    }
    if (type === "acTL") throw new Error("animated PNG is not accepted");
    if (type === "IEND") {
      if (length !== 0 || end !== bytes.length) throw new Error("PNG IEND/trailing bytes are invalid");
      sawEnd = true;
      break;
    }
    offset = end;
  }
  if (!dimensions || !sawEnd) throw new Error("PNG structure is incomplete");
  return dimensions;
}

function jpegDimensions(bytes) {
  const startOfFrame = new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 255) offset += 1;
    while (offset < bytes.length && bytes[offset] === 255) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || (marker >= 208 && marker <= 216)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("JPEG segment exceeds file bounds");
    if (startOfFrame.has(marker)) {
      if (length < 8) throw new Error("JPEG frame header is too short");
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error("JPEG has no supported frame header");
}

function webpDimensions(bytes) {
  const read24 = (o) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
  if (bytes.length < 30 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error("WebP RIFF length is invalid");
  let offset = 12;
  let dimensions;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    const end = data + length;
    if (end > bytes.length) throw new Error("WebP chunk exceeds file bounds");
    if (type === "VP8X") {
      if (length < 10) throw new Error("WebP VP8X chunk is too short");
      if ((bytes[data] & 2) !== 0) throw new Error("animated WebP is not accepted");
      dimensions = { height: read24(data + 7) + 1, width: read24(data + 4) + 1 };
    } else if (type === "VP8L" && !dimensions) {
      if (length < 5 || bytes[data] !== 47) throw new Error("WebP VP8L header is invalid");
      const bits = bytes.readUInt32LE(data + 1);
      dimensions = { height: ((bits >>> 14) & 16383) + 1, width: (bits & 16383) + 1 };
    } else if (type === "VP8 " && !dimensions) {
      if (length < 10 || bytes[data + 3] !== 157 || bytes[data + 4] !== 1 || bytes[data + 5] !== 42) {
        throw new Error("WebP VP8 frame header is invalid");
      }
      dimensions = { height: bytes.readUInt16LE(data + 8) & 16383, width: bytes.readUInt16LE(data + 6) & 16383 };
    } else if (type === "ANIM" || type === "ANMF") {
      throw new Error("animated WebP is not accepted");
    }
    offset = end + (length % 2);
  }
  if (!dimensions || offset !== bytes.length) throw new Error("WebP structure is incomplete");
  return dimensions;
}

export function inspectImageBytes(bytes) {
  const detected = detectImageFormat(bytes);
  if (!detected) {
    throw new TripoError("FILE_INVALID", "Only real PNG, JPEG, and WebP image data is accepted.", { stage: "image_inspect" });
  }
  let dimensions;
  try {
    dimensions = detected === "png" ? pngDimensions(bytes) : detected === "webp" ? webpDimensions(bytes) : jpegDimensions(bytes);
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The image container is corrupt, incomplete, or animated.", { cause: error, stage: "image_inspect" });
  }
  if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION || dimensions.width * dimensions.height > MAX_PIXELS) {
    throw new TripoError("FILE_INVALID", "Image dimensions must be positive, at most 16,384 per side, and at most 100 megapixels.", {
      details: dimensions,
      stage: "image_inspect"
    });
  }
  return { format: detected, ...dimensions };
}

// Real-path resolved image inspection. Returns content-verified format,
// dimensions, size and sha256 — the frozen-input contract for paid ops.
export async function inspectImage(inputPath) {
  const resolved = path.resolve(inputPath);
  let canonicalPath;
  try {
    canonicalPath = await realpath(resolved);
  } catch (error) {
    throw new TripoError("FILE_INVALID", `Image does not exist: ${resolved}`, { cause: error, stage: "prepare" });
  }
  const metadata = await stat(canonicalPath);
  if (!metadata.isFile()) {
    throw new TripoError("FILE_INVALID", "Image path must point to a regular file.", { stage: "prepare" });
  }
  if (metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES) {
    throw new TripoError("FILE_INVALID", "Image must be between 1 byte and 20 MiB.", { details: { size_bytes: metadata.size }, stage: "prepare" });
  }
  let bytes;
  try {
    bytes = await readFile(canonicalPath);
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The image could not be read.", { cause: error, stage: "prepare" });
  }
  if (bytes.length !== metadata.size) {
    throw new TripoError("FILE_CHANGED", "The image changed while it was being inspected.", { stage: "prepare" });
  }
  const inspected = inspectImageBytes(bytes);
  const extension = path.extname(canonicalPath).slice(1).toLowerCase();
  if (!["png", "jpg", "jpeg", "webp"].includes(extension)) {
    throw new TripoError("FILE_INVALID", "Image filename must end in .png, .jpg, .jpeg, or .webp.", { stage: "prepare" });
  }
  return {
    format: inspected.format === "jpeg" && extension === "jpg" ? "jpg" : inspected.format,
    height: inspected.height,
    mtimeMs: metadata.mtimeMs,
    path: canonicalPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: metadata.size,
    width: inspected.width
  };
}
