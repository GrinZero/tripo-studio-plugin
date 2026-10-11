import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fbxPbrBindings } from '../ui/fbx-materials.mjs';

function fixture(version = 7400, { gloss = false, malformed = false } = {}) {
  const wide = version >= 7500, headerSize = wide ? 25 : 13;
  const material = (id, name) => ({ name: 'Material', values: [id, name] });
  const texture = (id, name) => ({ name: 'Texture', values: [id, name] });
  const connection = (texture, material, property) => ({ name: 'C', values: ['OP', texture, material, property] });
  const tree = [{ name: 'Objects', children: [material(1, 'Material::Body\0\x01Material'), material(2, 'Head'), texture(3, gloss ? 'gloss_texture' : 'roughness_texture'), texture(4, 'metallic_texture'), texture(5, 'head_roughness')] },
    { name: 'Connections', children: [connection(3, 1, 'ShininessExponent'), connection(4, 1, 'ReflectionFactor'), connection(5, 2, 'Roughness'), { name: 'C', values: ['OO', 1, 0] }] }];
  function property(value) {
    if (typeof value === 'number') { const bytes = Buffer.alloc(9); bytes[0] = 76; bytes.writeBigInt64LE(BigInt(value), 1); return bytes; }
    const string = Buffer.from(value), bytes = Buffer.alloc(5); bytes[0] = 83; bytes.writeUInt32LE(string.length, 1); return Buffer.concat([bytes, string]);
  }
  function encode(node, offset) {
    const name = Buffer.from(node.name), properties = Buffer.concat((node.values ?? []).map(property));
    let childOffset = offset + headerSize + name.length + properties.length;
    const children = (node.children ?? []).map(child => { const bytes = encode(child, childOffset); childOffset += bytes.length; return bytes; });
    const end = childOffset + (children.length ? headerSize : 0), header = Buffer.alloc(headerSize);
    if (wide) { header.writeBigUInt64LE(BigInt(end), 0); header.writeBigUInt64LE(BigInt(node.values?.length ?? 0), 8); header.writeBigUInt64LE(BigInt(properties.length), 16); }
    else { header.writeUInt32LE(end, 0); header.writeUInt32LE(node.values?.length ?? 0, 4); header.writeUInt32LE(properties.length, 8); }
    header[headerSize - 1] = name.length;
    return Buffer.concat([header, name, properties, ...children, ...(children.length ? [Buffer.alloc(headerSize)] : [])]);
  }
  const header = Buffer.alloc(27); header.write('Kaydara FBX Binary  \0\x1a\0', 'binary'); header.writeUInt32LE(version, 23);
  let offset = 27; const nodes = tree.map(node => { const bytes = encode(node, offset); offset += bytes.length; return bytes; });
  const bytes = Buffer.concat([header, ...nodes, Buffer.alloc(headerSize)]);
  if (malformed) { if (wide) bytes.writeBigUInt64LE(BigInt(bytes.length + 100), 27); else bytes.writeUInt32LE(bytes.length + 100, 27); }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

for (const version of [7400, 7500]) it(`retains per-material Studio PBR connections in FBX ${version}`, () => {
  assert.deepEqual([...fbxPbrBindings(fixture(version))], [['Body', { roughnessMap: 3, metalnessMap: 4 }], ['Head', { roughnessMap: 5 }]]);
});
it('does not misinterpret generic FBX glossiness as a Studio roughness map', () => {
  assert.deepEqual(fbxPbrBindings(fixture(7400, { gloss: true })).get('Body'), { metalnessMap: 4 });
});
it('rejects invalid FBX bounds and ignores non-FBX input', () => {
  assert.throws(() => fbxPbrBindings(fixture(7400, { malformed: true })), /Invalid FBX/);
  assert.throws(() => fbxPbrBindings(fixture(7500, { malformed: true })), /Invalid FBX/);
  assert.deepEqual(fbxPbrBindings(new ArrayBuffer(20)), new Map());
});
