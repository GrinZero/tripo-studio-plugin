import { t as tr } from "./i18n.mjs";
import { ModelViewerElement } from "@google/model-viewer";
import {
  $scene,
  $needsRender,
} from "@google/model-viewer/lib/model-viewer-base.js";
import { modelPreviewSource } from "./model-preview-source.mjs";

const HOME_ORBIT = "36deg 65deg 105%";
// Each preview has its own short-lived blob URL; evict detached models promptly.
ModelViewerElement.modelCacheSize = 0;

export async function mountModel(container, dataUrl, { dark = false } = {}) {
  const source = await modelPreviewSource(dataUrl);
  const element = document.createElement("model-viewer");
  element.style.cssText =
    "display:block;width:100%;height:100%;position:relative;--poster-color:transparent;";
  element.alt = tr("模型预览");
  element.setAttribute("camera-controls", "");
  element.setAttribute("touch-action", "none");
  element.setAttribute("interaction-prompt", "none");
  element.setAttribute("loading", "eager");
  element.setAttribute("reveal", "auto");
  element.cameraOrbit = HOME_ORBIT;
  element.fieldOfView = "36deg";
  element.shadowIntensity = 0.65;
  element.shadowSoftness = 1;
  element.exposure = 1.05;
  element.environmentImage = "neutral";
  element.src = source.url;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      element.addEventListener("load", resolve, { once: true });
      element.addEventListener(
        "error",
        () => reject(Error(tr("暂无可用预览"))),
        { once: true }
      );
      timer = setTimeout(() => reject(Error(tr("暂无可用预览"))), 45000);
      container.prepend(element);
    });
  } catch (error) {
    element.remove();
    source.dispose();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  // These two exported symbols are confined to this adapter and pinned to the
  // tested model-viewer version. They keep the existing triangle/wireframe UI
  // while model-viewer owns loading, lighting, camera controls and rendering.
  const scene = element[$scene],
    materials = new Map();
  let triangles = 0;
  scene.model.traverse((object) => {
    if (!object.isMesh) return;
    triangles +=
      (object.geometry.index?.count ??
        object.geometry.attributes.position?.count ??
        0) / 3;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!materials.has(material)) materials.set(material, material.wireframe);
    }
  });
  const theme = (value) => {
    element.style.backgroundColor = value ? "#0c0e16" : "#f3f4f7";
  };
  theme(dark);
  return {
    triangles: Math.round(triangles),
    reset() {
      element.cameraOrbit = HOME_ORBIT;
      element.cameraTarget = "auto auto auto";
      element.fieldOfView = "36deg";
      element.jumpCameraToGoal();
    },
    wireframe(value) {
      for (const [material, original] of materials) {
        material.wireframe = value || original;
        material.needsUpdate = true;
      }
      element[$needsRender]();
    },
    theme,
    dispose() {
      for (const [material, original] of materials) {
        material.wireframe = original;
        material.needsUpdate = true;
      }
      element.remove();
      source.dispose();
    },
  };
}
