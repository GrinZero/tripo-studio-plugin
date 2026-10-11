// Read material/texture connections without decoding geometry or embedded images.
// Studio stores roughness as ShininessExponent and metallic as ReflectionFactor.
// Require the explicit texture names: a generic FBX gloss map is not roughness.
export function fbxPbrBindings(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), text = new TextDecoder();
  if (bytes.length < 27 || text.decode(bytes.subarray(0, 19)) !== 'Kaydara FBX Binary ') return new Map();
  const wide = view.getUint32(23, true) >= 7500, header = wide ? 25 : 13;
  const uint = offset => {
    const value = wide ? Number(view.getBigUint64(offset, true)) : view.getUint32(offset, true);
    if (!Number.isSafeInteger(value)) throw Error('Invalid FBX offset');
    return value;
  };
  let count = 0;
  function nodes(start, limit) {
    const result = [];
    for (let offset = start; offset + header <= limit;) {
      const end = uint(offset); if (!end) break;
      const properties = uint(offset + (wide ? 8 : 4)), size = uint(offset + (wide ? 16 : 8));
      const nameEnd = offset + header + bytes[offset + header - 1], dataEnd = nameEnd + size;
      if (++count > 100000 || end <= offset || end > limit || dataEnd > end || nameEnd > dataEnd) throw Error('Invalid FBX node');
      result.push({ name: text.decode(bytes.subarray(offset + header, nameEnd)), start: nameEnd, dataEnd, end, properties });
      offset = end;
    }
    return result;
  }
  function values(node, limit = 4) {
    const result = []; let offset = node.start;
    for (let i = 0; i < Math.min(node.properties, limit); i++) {
      if (offset >= node.dataEnd) throw Error('Invalid FBX property');
      const type = String.fromCharCode(bytes[offset++]);
      const size = type === 'L' ? 8 : ['I', 'S'].includes(type) ? 4 : 0;
      if (!size || offset + size > node.dataEnd) throw Error('Invalid FBX property');
      if (type === 'S') {
        const length = view.getUint32(offset, true); offset += 4;
        if (offset + length > node.dataEnd) throw Error('Invalid FBX string');
        result.push(text.decode(bytes.subarray(offset, offset + length))); offset += length;
      } else { result.push(type === 'L' ? Number(view.getBigInt64(offset, true)) : view.getInt32(offset, true)); offset += size; }
    }
    return result;
  }
  const top = nodes(27, bytes.length), objects = top.find(n => n.name === 'Objects'), connections = top.find(n => n.name === 'Connections');
  if (!objects || !connections) return new Map();
  const names = new Map(), textures = new Map(), bindings = new Map();
  const name = value => String(value).split('\0')[0].replace(/^\w+::/, '');
  for (const node of nodes(objects.dataEnd, objects.end)) {
    if (!['Material', 'Texture'].includes(node.name)) continue;
    const [id, rawName] = values(node, 2);
    (node.name === 'Material' ? names : textures).set(id, name(rawName));
  }
  for (const node of nodes(connections.dataEnd, connections.end)) {
    if (node.name !== 'C') continue;
    const [type, texture, material, property] = values(node);
    if (type !== 'OP' || !names.has(material)) continue;
    const textureName = textures.get(texture) ?? '';
    const channel = ['ShininessExponent', 'Roughness', 'Maya|TEX_roughness_map'].includes(property) && /roughness/i.test(textureName) ? 'roughnessMap'
      : ['ReflectionFactor', 'Metalness', 'Maya|TEX_metallic_map'].includes(property) && /metallic|metalness/i.test(textureName) ? 'metalnessMap' : null;
    if (!channel) continue;
    const materialName = names.get(material);
    if (!bindings.has(materialName)) bindings.set(materialName, {});
    bindings.get(materialName)[channel] = texture;
  }
  return bindings;
}
