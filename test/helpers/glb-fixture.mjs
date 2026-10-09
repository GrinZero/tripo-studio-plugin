// Two overlapping, independently named planes with UVs and distinct materials.
export function fixtureGlb() {
  const chunks=[],views=[],accessors=[];let offset=0;
  const add=(typed,type,componentType,count,extras={})=>{
    const bytes=Buffer.from(typed.buffer);const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});offset+=padded.length;
    accessors.push({bufferView:views.length-1,componentType,count,type,...extras});return accessors.length-1;
  };
  const indices=add(new Uint16Array([0,1,2,0,2,3]),'SCALAR',5123,6);
  const uv=add(new Float32Array([0,0,1,0,1,1,0,1]),'VEC2',5126,4);
  const meshes=[];for(let layer=0;layer<2;layer++) {
    const z=-layer*.25;const pos=add(new Float32Array([-1,-1,z,1,-1,z,1,1,z,-1,1,z]),'VEC3',5126,4,{min:[-1,-1,z],max:[1,1,z]});
    meshes.push({name:layer?'Back':'Front',primitives:[{attributes:{POSITION:pos,TEXCOORD_0:uv},indices,material:layer}]});
  }
  const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{name:'Front',mesh:0},{name:'Back',mesh:1}],meshes,materials:[{name:'Red',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,0,0,1],metallicFactor:0,roughnessFactor:1}},{name:'Green',doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0,1,0,1],metallicFactor:0,roughnessFactor:1}}],buffers:[{byteLength:offset}],bufferViews:views,accessors};
  const json=Buffer.from(JSON.stringify(document));const jsonChunk=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jsonChunk);const binary=Buffer.concat(chunks);const out=Buffer.alloc(12+8+jsonChunk.length+8+binary.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonChunk.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonChunk.copy(out,20);const b=20+jsonChunk.length;out.writeUInt32LE(binary.length,b);out.writeUInt32LE(0x004e4942,b+4);binary.copy(out,b+8);return out;
}
