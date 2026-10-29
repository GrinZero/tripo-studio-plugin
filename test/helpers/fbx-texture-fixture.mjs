export function textureFbx(image, version = 7400) {
  const wide = version >= 7500,
    headerSize = wide ? 25 : 13;
  function node(name, properties, children, offset, count = 0) {
    const header = Buffer.alloc(headerSize);
    const label = Buffer.from(name);
    let end = offset + headerSize + label.length + properties.length;
    const nested = children.map((child) => {
      const bytes = child(end);
      end += bytes.length;
      return bytes;
    });
    end += headerSize;
    if (wide) {
      header.writeBigUInt64LE(BigInt(end));
      header.writeBigUInt64LE(BigInt(count), 8);
      header.writeBigUInt64LE(BigInt(properties.length), 16);
    } else {
      header.writeUInt32LE(end);
      header.writeUInt32LE(count, 4);
      header.writeUInt32LE(properties.length, 8);
    }
    header[headerSize - 1] = label.length;
    return Buffer.concat([
      header,
      label,
      properties,
      ...nested,
      Buffer.alloc(headerSize),
    ]);
  }
  const raw = Buffer.alloc(5);
  raw[0] = 82;
  raw.writeUInt32LE(image.length, 1);
  const header = Buffer.alloc(27);
  header.write("Kaydara FBX Binary  \0\x1a\0", "binary");
  header.writeUInt32LE(version, 23);
  return Buffer.concat([
    header,
    node(
      "Objects",
      Buffer.alloc(0),
      [
        (offset) =>
          node(
            "Video",
            Buffer.alloc(0),
            [
              (offset) =>
                node("Content", Buffer.concat([raw, image]), [], offset, 1),
            ],
            offset
          ),
      ],
      27
    ),
    Buffer.alloc(headerSize),
  ]);
}
