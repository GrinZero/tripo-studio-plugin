// Run model-viewer-server.mjs with TRIPO_TEST_FBX pointing to a PBR FBX.
// Uses the actual artifact without storing a user's model in the repository.
async (page) => {
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const errors = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:43921")
    )
      external.push(request.url());
  });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("http://127.0.0.1:43921/?source=actual");
  await page.waitForFunction(
    () => document.body.dataset.ready || document.body.dataset.error
  );
  const state = await page.evaluate(() => {
    const conversion = window.previewConversion;
    const material = conversion?.materials.find(
      (m) => m.normalTexture && m.pbrMetallicRoughness?.metallicRoughnessTexture
    );
    let maps = false;
    window.scene()?.model.traverse((object) => {
      if (object.isMesh)
        for (const m of [].concat(object.material)) {
          maps ||= !!(
            m.map &&
            m.normalMap &&
            m.roughnessMap &&
            m.metalnessMap &&
            m.roughnessMap === m.metalnessMap &&
            m.normalMap.image.width <= 2048 &&
            m.map.image.width <= 2048
          );
        }
    });
    return {
      error: document.body.dataset.error,
      loaded: document.querySelector("model-viewer")?.loaded,
      bytes: conversion?.bytes,
      material,
      maps,
    };
  });
  assert(
    !state.error && state.loaded,
    `PBR model failed to load: ${state.error}`
  );
  assert(
    state.bytes < 32 * 1024 * 1024,
    "converted textures exceeded the interactive preview budget"
  );
  assert(
    state.material && state.maps,
    "preview lost base color, normal, roughness or metallic maps"
  );
  assert(
    state.material.pbrMetallicRoughness.metallicFactor === 1,
    "metallic map was disabled by the scalar factor"
  );
  await page.evaluate(() => window.adapter.theme(true));
  await page.screenshot({ path: "output/playwright/pbr-model-preview.png" });
  await page.evaluate(() => window.adapter.dispose());
  assert(
    (await page.locator("model-viewer").count()) === 0,
    "PBR viewer was not disposed"
  );
  assert(errors.length === 0, errors.join("; "));
  assert(external.length === 0, "preview fetched external resources");
  console.log(
    `PASS: actual PBR FBX renders with all maps; ${state.bytes} preview bytes, local-only CSP, disposal.`
  );
}
