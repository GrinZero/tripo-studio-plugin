// Isolated MCP host with real bundled viewer; no Studio requests or billing.
// Build, start i18n-server.mjs, then run through playwright-cli.
async (page) => {
  const base = "http://127.0.0.1:43911";
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.request.get(`${base}/reset`);
  await page.goto(`${base}/?card=source-model&locale=zh-CN&theme=dark`);
  const frame = page.frameLocator("#app");
  await frame.locator("#language").selectOption("zh-CN");
  const preview = frame.locator(".configuration-model-preview");
  await preview.locator("img").waitFor();
  let stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    stats.calls.some(
      (c) =>
        c.name === "tripo_ui_preview" &&
        c.arguments.project_id === "preview-model" &&
        c.arguments.type === "thumbnail"
    ),
    "source thumbnail must use the configured project"
  );
  assert(
    !stats.calls.some((c) => c.arguments.type === "model"),
    "thumbnail must display without downloading a model"
  );
  await page.screenshot({
    path: "output/playwright/configuration-model-thumbnail.png",
    fullPage: true,
  });
  await preview
    .getByRole("button", { name: "查看 3D 模型", exact: true })
    .click();
  await preview.locator("model-viewer").waitFor();
  const child = page.frames().find((f) => f.url().endsWith("/card"));
  await child.waitForFunction(
    () => document.querySelector("model-viewer")?.loaded
  );
  await preview
    .getByRole("button", { name: "重置视角", exact: true })
    .waitFor();
  stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    stats.review.status === "pending" &&
      Number.isFinite(stats.review.deadline_at),
    "inspecting the source must preserve automatic submission when parameters are unchanged"
  );
  assert(
    !stats.calls.some((c) => ["save", "confirm"].includes(c.arguments.action)),
    "preview must never submit a paid operation"
  );
  await page.evaluate(() => window.setHostTheme("light"));
  await child.waitForFunction(
    () =>
      document.querySelector("model-viewer").style.backgroundColor ===
      "rgb(243, 244, 247)"
  );
  await preview.getByRole("button", { name: "重置视角", exact: true }).click();
  stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    !stats.calls.some((c) => c.arguments.action === "edit"),
    "opening and resetting the viewer must not pause unchanged parameters"
  );
  await page.screenshot({
    path: "output/playwright/configuration-model-3d.png",
    fullPage: true,
  });
  const project = frame.getByRole("textbox", { name: "源模型", exact: true });
  await project.fill("slow-model");
  await frame
    .getByRole("button", { name: "保存并提交", exact: true })
    .waitFor();
  stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    stats.review.status === "editing" && stats.review.deadline_at === null,
    "changing the source model parameter must pause submission"
  );
  await page.waitForRequest(
    (r) =>
      r.url().endsWith("/rpc") &&
      r.postDataJSON()?.arguments?.project_id === "slow-model",
    { timeout: 5000 }
  );
  // Race a late old thumbnail against the replacement's 3D preview.
  await project.fill("replacement-model");
  await preview
    .getByRole("button", { name: "查看 3D 模型", exact: true })
    .click();
  await child.waitForFunction(
    () => document.querySelector("model-viewer")?.loaded
  );
  await page.waitForTimeout(1400);
  assert(
    (await preview.locator("model-viewer").count()) === 1 &&
      (await preview.locator("img").count()) === 0,
    "late thumbnail must not replace the current model"
  );
  await project.fill("broken-model");
  await preview
    .getByText("3D 预览暂不可用，可重试或核对源模型 ID。", { exact: true })
    .waitFor();
  assert(
    (await preview.locator("model-viewer").count()) === 0 &&
      (await preview.locator("img").count()) === 0,
    "unavailable project must not retain the previous model"
  );
  await preview.getByRole("button", { name: "重试 3D 预览" }).click();
  await preview
    .getByRole("button", { name: "重试 3D 预览" })
    .waitFor({ state: "visible" });
  await project.fill("");
  assert(await preview.isHidden(), "empty project must clear the preview");
  await page.request.get(`${base}/reset`);
  await page.goto(
    `${base}/?card=source-model-fallback&locale=zh-CN&theme=dark`
  );
  await preview.locator("model-viewer").waitFor();
  const fallback = page.frames().find((f) => f.url().endsWith("/card"));
  await fallback.waitForFunction(
    () => document.querySelector("model-viewer")?.loaded
  );
  assert(
    (await preview.locator("img").count()) === 0,
    "missing thumbnail must fall back to a real 3D model"
  );
  await preview.locator("model-viewer").evaluate((element) => {
    element.focus();
    element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
  });
  await page.waitForTimeout(750);
  stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    stats.review.status === "pending" &&
      Number.isFinite(stats.review.deadline_at),
    "automatic preview loading/focus must keep the countdown running"
  );
  assert(
    !stats.calls.some((c) => c.arguments.action === "edit"),
    "preview setup must not send edit requests"
  );
  await preview.locator("model-viewer").press("ArrowLeft");
  await page.waitForTimeout(750);
  stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    stats.review.status === "pending" &&
      Number.isFinite(stats.review.deadline_at),
    "real keyboard inspection must preserve unchanged parameters"
  );
  await page.setViewportSize({ width: 390, height: 950 });
  const languages = frame.locator("#language");
  await languages.selectOption("en");
  await preview
    .getByRole("heading", { name: "Source model preview" })
    .waitFor();
  assert(
    await fallback.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    ),
    "preview must fit a narrow card"
  );
  await page.screenshot({
    path: "output/playwright/configuration-model-mobile.png",
    fullPage: true,
  });
  assert(errors.length === 0, errors.join("\n"));
  console.log(
    "PASS: viewing preserves the countdown, changed source pauses, theme/language changes, replacement, failure, fallback and narrow card."
  );
}
