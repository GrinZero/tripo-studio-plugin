import { LoadingManager, TextureLoader, MeshStandardMaterial } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { t as tr } from './i18n.mjs';
import { fbxPbrBindings } from './fbx-materials.mjs';

const MAX_PREVIEW = 32 * 1024 * 1024;
const MAX_TEXTURE_SIZE = 2048;

// model-viewer renders GLB. Convert Studio's native quad FBX in memory, keeping
// the downloaded source intact and avoiding a dependency on local Blender.
export async function modelPreviewSource(dataUrl) {
  if (!/^data:model\/(gltf-binary|fbx);base64,/.test(dataUrl)) throw Error(tr('暂无可用预览'));
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
  if (bytes.length > MAX_PREVIEW) throw Error(tr('暂无可用预览'));
  let binary = bytes.buffer;
  if (dataUrl.startsWith('data:model/fbx;')) {
    const manager = new LoadingManager(), urls = new Set();
    const texturesById = new Map(), loadedTextures = [], originalMaterials = new Set();
    class PreviewTextureLoader extends TextureLoader {
      load(...args) { const texture = super.load(...args); loadedTextures.push(texture); return texture; }
    }
    manager.addHandler(/\.(png|jpe?g|webp|bmp|gif)$/i, new PreviewTextureLoader(manager));
    let started = false, failure, loaded;
    const textures = new Promise(resolve => { loaded = resolve; });
    manager.onStart = () => { started = true; };
    manager.onLoad = loaded;
    manager.onError = () => { failure = Error(tr('暂无可用预览')); };
    manager.setURLModifier(url => {
      if (!/^(blob:|data:)/.test(url)) throw Error(tr('模型使用外部资源，请下载后查看。'));
      if (url.startsWith('blob:')) urls.add(url);
      return url;
    });
    let group;
    try {
      group = new FBXLoader(manager).parse(binary, '');
      if (started) await textures;
      if (failure) throw failure;
      const bindings = fbxPbrBindings(binary), materials = new Map();
      for (const texture of loadedTextures) {
        texturesById.set(texture.ID, texture);
        // JPEG source textures otherwise expand into full-size lossless PNGs.
        // Limit only the interactive preview; retain the downloaded FBX verbatim.
        const image = texture.image, scale = Math.min(1, MAX_TEXTURE_SIZE / image.width, MAX_TEXTURE_SIZE / image.height);
        if (scale < 1) {
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); texture.image = canvas; texture.needsUpdate = true;
        }
      }
      group.traverse(object => {
        if (!object.material) return;
        const convert = material => {
          if (material.isMeshStandardMaterial || material.isMeshBasicMaterial) return material;
          if (materials.has(material)) return materials.get(material);
          const maps = bindings.get(material.name) ?? {};
          const roughnessMap = texturesById.get(maps.roughnessMap), metalnessMap = texturesById.get(maps.metalnessMap);
          const parameters = { name: material.name, color: material.color, map: material.map,
            normalMap: material.normalMap, normalScale: material.normalScale, aoMap: material.aoMap, aoMapIntensity: material.aoMapIntensity,
            emissive: material.emissive, emissiveMap: material.emissiveMap, emissiveIntensity: material.emissiveIntensity,
            alphaMap: material.alphaMap, transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest,
            side: material.side, depthWrite: material.depthWrite, vertexColors: material.vertexColors, flatShading: material.flatShading,
            roughnessMap, metalnessMap, metalness: metalnessMap ? 1 : 0,
            roughness: roughnessMap ? 1 : material.shininess ? Math.sqrt(2 / (material.shininess + 2)) : 1 };
          const next = new MeshStandardMaterial(Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== undefined)));
          originalMaterials.add(material); materials.set(material, next); return next;
        };
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
      });
      binary = await new GLTFExporter().parseAsync(group, { binary: true, animations: group.animations, maxTextureSize: MAX_TEXTURE_SIZE });
      if (binary.byteLength > MAX_PREVIEW) throw Error(tr('暂无可用预览'));
    } finally {
      for (const texture of loadedTextures) texture.dispose();
      for (const material of originalMaterials) material.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
      group?.traverse(object => {
        object.geometry?.dispose();
        if (!object.material) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
          material.dispose();
        }
      });
    }
  }
  const url = URL.createObjectURL(new Blob([binary], { type: 'model/gltf-binary' }));
  return { url, dispose: () => URL.revokeObjectURL(url) };
}
