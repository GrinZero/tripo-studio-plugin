import { t as tr } from './i18n.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function mountModel(container, dataUrl, { dark = false } = {}) {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .01, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(blob:|data:)/.test(url)) return url;
    throw Error(tr("模型使用外部资源，请下载后查看。"));
  });
  let gltf;
  const loader = new GLTFLoader(manager);
  // Embedded images use img-src blob: rather than ImageBitmapLoader's fetch,
  // so previews work with the host's connect-src 'none' sandbox policy.
  loader.register(parser => {
    parser.textureLoader = new THREE.TextureLoader(manager);
    return { name: 'TRIPO_SANDBOX_IMAGES' };
  });
  try { gltf = await loader.parseAsync(bytes.buffer, ''); }
  catch (error) { controls.dispose(); renderer.dispose(); throw error; }
  const group = gltf.scene;
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z, .001);
  group.position.sub(center); group.scale.setScalar(scale); group.position.multiplyScalar(scale);
  scene.add(group);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x8c8580, .65); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(1024,1024); key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3; key.shadow.normalBias = .02; scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .4); fill.position.set(-3, 2, -2); scene.add(fill);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(environment, .04);
  scene.environment = env.texture; environment.dispose(); pmrem.dispose();
  scene.environmentIntensity = .45;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.MeshStandardMaterial({ color: dark ? 0x12141d : 0xeef1f7, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -size.y * scale / 2 - .015; floor.receiveShadow = true; scene.add(floor);
  let disposed = false, triangles = 0;
  const materials = new Map();
  group.traverse(object => { if (object.isMesh) { materials.set(object,{original:object.material,wire:new THREE.MeshBasicMaterial({color:dark ? 0xc0c0c8 : 0x565661,wireframe:true})}); object.castShadow = true; object.receiveShadow = true; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3; } });
  const render = () => { if (!disposed) renderer.render(scene, camera); };
  const reset = () => { camera.position.set(2.5, 1.55, 3.4); controls.target.set(0, 0, 0); camera.lookAt(0, 0, 0); controls.update(); render(); };
  const resize = () => { const { width, height } = container.getBoundingClientRect(); if (!width || !height || disposed) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); };
  controls.addEventListener('change', render);
  container.prepend(renderer.domElement);
  const observer = new ResizeObserver(resize); observer.observe(container);
  resize(); reset();
  return {
    triangles: Math.round(triangles), reset,
    wireframe(value) { for (const [object,m] of materials) object.material = value ? m.wire : m.original; render(); },
    theme(value) { floor.material.color.set(value ? 0x12141d : 0xeef1f7); for (const m of materials.values()) m.wire.color.set(value ? 0xc0c0c8 : 0x565661); render(); },
    dispose() { disposed = true; observer.disconnect(); controls.dispose(); for (const [object,item] of materials) { object.geometry.dispose(); item.wire.dispose(); for (const m of Array.isArray(item.original) ? item.original : [item.original]) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); } } floor.geometry.dispose(); floor.material.dispose(); env.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
