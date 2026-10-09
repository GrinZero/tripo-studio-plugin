import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { TripoError } from "../errors.mjs";
import { MAX_IMPORT_MODEL_BYTES, MAX_IMPORT_MODEL_FACES } from "../constants.mjs";

const GLB_MAGIC = 1179937895;
const GLB_JSON_CHUNK = 1313821514;
const FBX_BINARY_MAGIC = Buffer.from("Kaydara FBX Binary  \0\0", "binary");
const MAX_TEXT_LINE_BYTES = 1024 * 1024;
const MAX_FBX_INDEX_BYTES = 64 * 1024 * 1024;

function invalid(message, details) {
  return new TripoError("FILE_INVALID", message, { ...(details === undefined ? {} : { details }), stage: "model_inspect" });
}

function assertFaceLimit(faceCount) {
  if (!Number.isSafeInteger(faceCount) || faceCount < 1) throw invalid("The model contains no supported polygon faces.");
  if (faceCount > MAX_IMPORT_MODEL_FACES) {
    throw invalid("The model exceeds Studio's current 3,000,000-face import limit.", { face_count: faceCount, max_faces: MAX_IMPORT_MODEL_FACES });
  }
}

function plainObject(value) {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspectGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) throw invalid("The .glb file has no valid GLB magic header.");
  if (bytes.readUInt32LE(4) !== 2) throw invalid("Only GLB version 2 is supported by the current Studio importer.");
  if (bytes.readUInt32LE(8) !== bytes.length) throw invalid("The GLB declared length does not match the file size.");
  let offset = 12;
  let document;
  let chunkIndex = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw invalid("The GLB chunk table is truncated.");
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (length % 4 !== 0 || end > bytes.length) throw invalid("A GLB chunk is misaligned or exceeds the file bounds.");
    if (chunkIndex === 0 && type !== GLB_JSON_CHUNK) throw invalid("The first GLB chunk must be JSON.");
    if (type === GLB_JSON_CHUNK) {
      if (document !== undefined) throw invalid("The GLB contains multiple JSON chunks.");
      try {
        document = JSON.parse(bytes.subarray(start, end).toString("utf8").replace(/[\u0000\u0020]+$/g, ""));
      } catch (error) {
        throw new TripoError("FILE_INVALID", "The GLB JSON chunk is invalid.", { cause: error, stage: "model_inspect" });
      }
    }
    offset = end;
    chunkIndex += 1;
  }
  if (offset !== bytes.length || !plainObject(document)) throw invalid("The GLB has no valid JSON document.");
  const accessors = Array.isArray(document.accessors) ? document.accessors : [];
  const meshes = Array.isArray(document.meshes) ? document.meshes : [];
  let faceCount = 0;
  let isUvMapped = false;
  for (const mesh of meshes) {
    if (!plainObject(mesh) || !Array.isArray(mesh.primitives)) continue;
    for (const primitive of mesh.primitives) {
      if (!plainObject(primitive)) continue;
      const attributes = plainObject(primitive.attributes) ? primitive.attributes : {};
      if (Number.isSafeInteger(attributes.TEXCOORD_0)) isUvMapped = true;
      const accessorIndex = Number.isSafeInteger(primitive.indices) ? Number(primitive.indices) : Number(attributes.POSITION);
      const accessor = accessors[accessorIndex];
      if (!plainObject(accessor) || !Number.isSafeInteger(accessor.count) || Number(accessor.count) < 0) continue;
      const count = Number(accessor.count);
      const mode = primitive.mode === undefined ? 4 : Number(primitive.mode);
      if (mode === 4) faceCount += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) faceCount += Math.max(0, count - 2);
      if (faceCount > MAX_IMPORT_MODEL_FACES) assertFaceLimit(faceCount);
    }
  }
  assertFaceLimit(faceCount);
  return { faceCount, isUvMapped };
}

function eachTextLine(bytes, visit) {
  let start = 0;
  for (let index = 0; index <= bytes.length; index += 1) {
    if (index !== bytes.length && bytes[index] !== 10) continue;
    let end = index;
    if (end > start && bytes[end - 1] === 13) end -= 1;
    if (end - start > MAX_TEXT_LINE_BYTES) throw invalid("The text model contains an unexpectedly long line.");
    const lineBytes = bytes.subarray(start, end);
    if (lineBytes.includes(0)) throw invalid("The text model contains NUL bytes.");
    visit(lineBytes.toString("utf8"));
    start = index + 1;
  }
}

function inspectObj(bytes) {
  let vertices = 0;
  let textureVertices = 0;
  let faceCount = 0;
  let faceHasUv = false;
  eachTextLine(bytes, (raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (/^v\s+/i.test(line)) vertices += 1;
    else if (/^vt\s+/i.test(line)) textureVertices += 1;
    else if (/^f\s+/i.test(line)) {
      const references = line.slice(1).trim().split(/\s+/);
      if (references.length < 3 || references.some((entry) => !/^[+-]?\d+(?:\/[+-]?\d*)?(?:\/[+-]?\d+)?$/.test(entry))) {
        throw invalid("The OBJ contains an invalid face record.");
      }
      faceCount += references.length - 2;
      faceHasUv ||= references.some((entry) => /^[-+]?\d+\/[-+]?\d+/.test(entry));
      if (faceCount > MAX_IMPORT_MODEL_FACES) assertFaceLimit(faceCount);
    }
  });
  if (vertices < 3) throw invalid("The OBJ contains fewer than three vertices.");
  assertFaceLimit(faceCount);
  return { faceCount, isUvMapped: textureVertices > 0 && faceHasUv };
}

function inspectStl(bytes) {
  if (bytes.length >= 84) {
    const triangles = bytes.readUInt32LE(80);
    const expected = 84 + triangles * 50;
    if (Number.isSafeInteger(expected) && expected === bytes.length) {
      assertFaceLimit(triangles);
      return { faceCount: triangles, isUvMapped: false };
    }
  }
  let facets = 0;
  let vertices = 0;
  let sawSolid = false;
  let sawEnd = false;
  eachTextLine(bytes, (raw) => {
    const line = raw.trim().toLowerCase();
    if (!line) return;
    if (line.startsWith("solid")) sawSolid = true;
    else if (line.startsWith("facet normal")) facets += 1;
    else if (line.startsWith("vertex ")) vertices += 1;
    else if (line.startsWith("endsolid")) sawEnd = true;
    if (facets > MAX_IMPORT_MODEL_FACES) assertFaceLimit(facets);
  });
  if (!sawSolid || !sawEnd || vertices !== facets * 3) throw invalid("The STL is neither a valid bounded binary STL nor a complete ASCII STL.");
  assertFaceLimit(facets);
  return { faceCount: facets, isUvMapped: false };
}

function readSafeUInt64(bytes, offset) {
  const value = bytes.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid("The FBX contains an unsupported 64-bit offset.");
  return Number(value);
}

function fbxArray(bytes, propertyOffset) {
  if (propertyOffset + 13 > bytes.length) throw invalid("The FBX array property is truncated.");
  const length = bytes.readUInt32LE(propertyOffset + 1);
  const encoding = bytes.readUInt32LE(propertyOffset + 5);
  const compressedLength = bytes.readUInt32LE(propertyOffset + 9);
  const start = propertyOffset + 13;
  const end = start + compressedLength;
  const outputBytes = length * 4;
  if (!Number.isSafeInteger(outputBytes) || outputBytes > MAX_FBX_INDEX_BYTES || end > bytes.length) throw invalid("The FBX polygon index array exceeds safe bounds.");
  let data;
  if (encoding === 0) data = bytes.subarray(start, end);
  else if (encoding === 1) {
    try {
      data = inflateSync(bytes.subarray(start, end), { maxOutputLength: outputBytes });
    } catch (error) {
      throw new TripoError("FILE_INVALID", "The compressed FBX polygon index array is invalid.", { cause: error, stage: "model_inspect" });
    }
  } else throw invalid("The FBX uses an unsupported array encoding.");
  if (data.length !== outputBytes) throw invalid("The FBX polygon index array length is inconsistent.");
  return { data, next: end };
}

function inspectBinaryFbx(bytes) {
  if (bytes.length < 27 || !bytes.subarray(0, FBX_BINARY_MAGIC.length).equals(FBX_BINARY_MAGIC)) throw invalid("The binary FBX header is invalid.");
  const version = bytes.readUInt32LE(23);
  if (version < 6000 || version > 9000) throw invalid("The FBX version is outside the supported binary range.");
  const wide = version >= 7500;
  const headerSize = wide ? 25 : 13;
  const nullSize = headerSize;
  let faceCount = 0;
  let isUvMapped = false;
  let nodeCount = 0;
  const visitNode = (offset, parentEnd) => {
    if (offset + headerSize > parentEnd || offset + headerSize > bytes.length) return parentEnd;
    const endOffset = wide ? readSafeUInt64(bytes, offset) : bytes.readUInt32LE(offset);
    const propertyCount = wide ? readSafeUInt64(bytes, offset + 8) : bytes.readUInt32LE(offset + 4);
    const propertyBytes = wide ? readSafeUInt64(bytes, offset + 16) : bytes.readUInt32LE(offset + 8);
    const nameLength = bytes[offset + (wide ? 24 : 12)];
    if (endOffset === 0 && propertyCount === 0 && propertyBytes === 0 && nameLength === 0) return offset + nullSize;
    nodeCount += 1;
    if (nodeCount > 1e6) throw invalid("The FBX contains too many nodes.");
    const nameStart = offset + headerSize;
    const nameEnd = nameStart + nameLength;
    const propertyStart = nameEnd;
    const propertyEnd = propertyStart + propertyBytes;
    if (endOffset <= offset || endOffset > parentEnd || endOffset > bytes.length || propertyEnd > endOffset) {
      throw invalid("The FBX node offsets are inconsistent.");
    }
    const name = bytes.subarray(nameStart, nameEnd).toString("utf8");
    if (name === "LayerElementUV" || name === "UV" || name === "UVIndex") isUvMapped = true;
    if (name === "PolygonVertexIndex") {
      if (propertyCount < 1 || propertyStart >= propertyEnd || String.fromCharCode(bytes[propertyStart]) !== "i") {
        throw invalid("The FBX PolygonVertexIndex property is not an Int32 array.");
      }
      const array = fbxArray(bytes, propertyStart).data;
      let polygonVertices = 0;
      for (let index = 0; index < array.length; index += 4) {
        const value = array.readInt32LE(index);
        polygonVertices += 1;
        if (value < 0) {
          if (polygonVertices < 3) throw invalid("The FBX contains a polygon with fewer than three vertices.");
          faceCount += polygonVertices - 2;
          polygonVertices = 0;
          if (faceCount > MAX_IMPORT_MODEL_FACES) assertFaceLimit(faceCount);
        }
      }
      if (polygonVertices !== 0) throw invalid("The FBX polygon index array ends mid-polygon.");
    }
    let child = propertyEnd;
    const childLimit = endOffset - nullSize;
    while (child + headerSize <= childLimit) {
      const next = visitNode(child, endOffset);
      if (next <= child) throw invalid("The FBX node traversal made no progress.");
      child = next;
    }
    return endOffset;
  };
  let offset = 27;
  while (offset + headerSize <= bytes.length) {
    const next = visitNode(offset, bytes.length);
    if (next === offset + nullSize && bytes.subarray(offset, next).every((value) => value === 0)) break;
    if (next <= offset) throw invalid("The FBX top-level traversal made no progress.");
    offset = next;
  }
  assertFaceLimit(faceCount);
  return { faceCount, isUvMapped };
}

function inspectAsciiFbx(bytes) {
  if (bytes.includes(0)) throw invalid("The ASCII FBX contains NUL bytes.");
  const text = bytes.toString("utf8");
  if (!/FBXHeaderExtension\s*:/i.test(text) || !/Objects\s*:/i.test(text)) throw invalid("The ASCII FBX header is invalid.");
  const marker = /PolygonVertexIndex\s*:\s*\*\d+\s*\{\s*a\s*:/gi;
  let faceCount = 0;
  let found = false;
  for (let match = marker.exec(text); match; match = marker.exec(text)) {
    found = true;
    const start = marker.lastIndex;
    const end = text.indexOf("}", start);
    if (end < 0) throw invalid("The ASCII FBX polygon array is incomplete.");
    const values = text.slice(start, end).match(/-?\d+/g) ?? [];
    let polygonVertices = 0;
    for (const raw of values) {
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) throw invalid("The ASCII FBX contains an invalid polygon index.");
      polygonVertices += 1;
      if (value < 0) {
        if (polygonVertices < 3) throw invalid("The ASCII FBX contains a polygon with fewer than three vertices.");
        faceCount += polygonVertices - 2;
        polygonVertices = 0;
        if (faceCount > MAX_IMPORT_MODEL_FACES) assertFaceLimit(faceCount);
      }
    }
    if (polygonVertices !== 0) throw invalid("The ASCII FBX polygon index array ends mid-polygon.");
    marker.lastIndex = end + 1;
  }
  if (!found) throw invalid("The ASCII FBX contains no PolygonVertexIndex geometry.");
  assertFaceLimit(faceCount);
  return { faceCount, isUvMapped: /LayerElementUV\s*:/i.test(text) };
}

function formatFromPath(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!["fbx", "glb", "obj", "stl"].includes(extension)) throw invalid("Model filename must end in .glb, .obj, .fbx, or .stl.");
  return extension;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

// Full content inspection of an importable model: container validation, face
// count, UV detection and content hash. Used for model.import and for listing
// GLB part names via inspectGlbNodes.
export async function inspectModel(inputPath) {
  const resolved = path.resolve(inputPath);
  let canonicalPath;
  try {
    canonicalPath = await realpath(resolved);
  } catch (error) {
    throw new TripoError("FILE_INVALID", `Model does not exist: ${resolved}`, { cause: error, stage: "model_inspect" });
  }
  const metadata = await stat(canonicalPath);
  if (!metadata.isFile()) throw invalid("Model path must point to a regular file.");
  if (metadata.size < 1 || metadata.size > MAX_IMPORT_MODEL_BYTES) {
    throw invalid("Model must be between 1 byte and 150 MiB.", { size_bytes: metadata.size });
  }
  const format = formatFromPath(canonicalPath);
  let bytes;
  try {
    bytes = await readFile(canonicalPath);
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The model could not be read.", { cause: error, stage: "model_inspect" });
  }
  if (bytes.length !== metadata.size) throw new TripoError("FILE_CHANGED", "The model changed while it was being read.", { stage: "model_inspect" });
  const geometry = format === "glb" ? inspectGlb(bytes) : format === "obj" ? inspectObj(bytes) : format === "stl" ? inspectStl(bytes) : inspectFbx(bytes);
  const sha256 = await sha256File(canonicalPath);
  const after = await stat(canonicalPath);
  if (after.size !== metadata.size || after.mtimeMs !== metadata.mtimeMs) {
    throw new TripoError("FILE_CHANGED", "The model changed while it was being inspected.", { stage: "model_inspect" });
  }
  return {
    faceCount: geometry.faceCount,
    format,
    isUvMapped: geometry.isUvMapped,
    mtimeMs: metadata.mtimeMs,
    path: canonicalPath,
    sha256,
    size: metadata.size
  };
}

// Extract node/mesh names from a GLB binary for the parts catalog.
export function glbNodeNames(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== 2) {
    throw new TripoError("FILE_INVALID", "The artifact is not a valid GLB v2 file.", { stage: "parts" });
  }
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== GLB_JSON_CHUNK || 20 + length > bytes.length) {
    throw new TripoError("FILE_INVALID", "The GLB JSON chunk is missing.", { stage: "parts" });
  }
  let document;
  try {
    document = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8").replace(/[\u0000\u0020]+$/g, ""));
  } catch (error) {
    throw new TripoError("FILE_INVALID", "The GLB JSON chunk is invalid.", { cause: error, stage: "parts" });
  }
  const names = [];
  for (const node of document.nodes ?? []) {
    if (node && typeof node.name === "string" && node.name.trim()) names.push(node.name.trim());
  }
  return names;
}
