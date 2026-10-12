// Studio's quad Smart Mesh outputs may be binary FBX rather than GLB.
// Inspect bytes so older downloads with a misleading suffix still preview.
const FBX_MAGIC = Buffer.from("Kaydara FBX Binary  \0\x1a\0", "binary");

export function binaryModelFormat(bytes) {
  if (
    bytes.length >= 27 &&
    bytes.subarray(0, 23).equals(FBX_MAGIC) &&
    bytes.readUInt32LE(23) >= 6400
  )
    return "fbx";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "glTF")
    return "glb";
  return null;
}

export function nativeModelName(name, url) {
  if (!/\.glb$/i.test(name) || !url) return name;
  return /\.fbx$/i.test(new URL(url).pathname)
    ? name.replace(/\.glb$/i, ".fbx")
    : name;
}
