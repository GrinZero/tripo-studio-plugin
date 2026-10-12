// Isolated task-centre regression: no Studio generation or billing.
// Build, start i18n-server.mjs, then playwright-cli run-code --filename this file.
async (page) => {
  const base = "http://127.0.0.1:43911";
  const assert = (value, message) => {
    if (!value) throw Error(message);
  };
  const errors = [],
    calls = [];
  let failPreview = false,
    holdModel = false,
    releaseModel,
    modelRequested;
  const modelStarted = new Promise((resolve) => {
    modelRequested = resolve;
  });
  const modelGate = new Promise((resolve) => {
    releaseModel = resolve;
  });
  const tasks = [
    {
      task_id: "source-draft",
      kind: "model.remesh",
      status: "staged",
      input_summary: { project_id: "model", face_limit: 10000 },
    },
    {
      task_id: "completed-model",
      kind: "model.generate",
      status: "succeeded",
      result: { project_id: "model" },
      input_summary: {},
    },
    {
      task_id: "image-output",
      kind: "image.generate",
      status: "succeeded",
      result: { asset_id: "image" },
      input_summary: {},
    },
    {
      task_id: "empty-draft",
      kind: "model.generate",
      status: "staged",
      input_summary: {},
    },
  ].map((task) => ({ ...task, created_at: "2026-10-11T00:00:00Z" }));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/rpc", async (route) => {
    const call = route.request().postDataJSON();
    calls.push(call);
    const response = await route.fetch(),
      body = await response.json();
    if (call.name === "tripo_list_tasks") body.structuredContent.tasks = tasks;
    if (call.name === "tripo_get_task")
      body.structuredContent.task = tasks.find(
        (task) => task.task_id === call.arguments.task_id
      );
    if (call.name === "tripo_ui_preview") {
      if (
        holdModel &&
        call.arguments.task_id === "completed-model" &&
        call.arguments.type === "model"
      ) {
        modelRequested();
        await modelGate;
      }
      if (failPreview && call.arguments.type) {
        await route.fulfill({
          response,
          json: {
            isError: true,
            structuredContent: { error: { message: "预览读取失败（测试）" } },
          },
        });
        return;
      }
      if (call.arguments.type !== "model")
        body._meta.tripo.preview.data_url =
          "data:image/svg+xml;base64," +
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="256"><rect x="60" y="20" width="200" height="216" fill="#ff6030"/></svg>'
          ).toString("base64");
    }
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 1560, height: 820 });
  await page.goto(`${base}/?locale=zh-CN&theme=dark`);
  const frame = page.frameLocator("#app");
  await frame.getByRole("tab", { name: "任务", exact: true }).click();
  await frame
    .locator("#taskPreviewMessage.hidden")
    .waitFor({ state: "attached" });
  assert(
    await frame
      .locator("#taskModelViewport model-viewer")
      .evaluate((model) => model.loaded),
    "draft source model did not load"
  );
  assert(
    calls.some(
      (call) =>
        call.name === "tripo_ui_preview" &&
        call.arguments.task_id === "source-draft" &&
        call.arguments.type === "model"
    ),
    "draft must preview its source through the task handle"
  );
  await frame.getByRole("button", { name: "线框模式", exact: true }).click();
  assert(
    await frame
      .getByRole("button", { name: "线框模式", exact: true })
      .getAttribute("class")
      .then((value) => value.includes("active")),
    "wireframe control did not activate"
  );
  await frame.getByRole("button", { name: "重置视角", exact: true }).click();
  await page.screenshot({
    path: "output/playwright/task-preview-model.png",
    fullPage: true,
  });
  holdModel = true;
  await frame
    .locator('[data-action="task"][data-id="completed-model"]')
    .click();
  await modelStarted;
  failPreview = true;
  await frame.locator('[data-action="task"][data-id="image-output"]').click();
  await frame
    .locator("#taskPreviewMessage")
    .getByText("预览读取失败（测试）", { exact: true })
    .waitFor();
  assert(
    await frame
      .getByRole("button", { name: "重新加载", exact: true })
      .isVisible(),
    "failed preview must offer retry"
  );
  failPreview = false;
  await frame.getByRole("button", { name: "重新加载", exact: true }).click();
  await frame
    .locator("#taskPreviewMessage.hidden")
    .waitFor({ state: "attached" });
  const image = await frame.locator(".task-preview img").evaluate((img) => ({
    loaded: img.complete && img.naturalWidth > 0,
    width: img.getBoundingClientRect().width,
    height: img.getBoundingClientRect().height,
  }));
  assert(
    image.loaded && image.width > 100 && image.height > 100,
    `task preview is blank: ${JSON.stringify(image)}`
  );
  releaseModel();
  await frame
    .locator('[data-action="task"][data-id="completed-model"]')
    .click();
  await frame
    .locator("#taskPreviewMessage.hidden")
    .waitFor({ state: "attached" });
  assert(
    (await frame.locator("model-viewer").count()) === 1,
    "task switching leaked or lost its viewer"
  );
  await frame.locator("#language").selectOption("en");
  await frame
    .locator("#taskPreviewMessage.hidden")
    .waitFor({ state: "attached" });
  await page.setViewportSize({ width: 390, height: 844 });
  const modelBox = await frame.locator("model-viewer").boundingBox();
  assert(
    modelBox.width > 100 && modelBox.height >= 150,
    "mobile model preview collapsed"
  );
  await frame.locator('[data-action="task"][data-id="empty-draft"]').click();
  await frame
    .getByRole("heading", { name: "Settings saved as a draft", exact: true })
    .waitFor();
  assert(
    (await frame.locator("model-viewer").count()) === 0,
    "previous model survived selecting a draft without output"
  );
  assert(
    await frame
      .getByText("Settings saved as a draft", { exact: true })
      .isVisible(),
    "draft without a source must keep its empty state"
  );
  assert(
    !calls.some((call) =>
      [
        "tripo_submit_task",
        "tripo_remesh_model",
        "tripo_generate_model",
      ].includes(call.name)
    ),
    "preview submitted an operation"
  );
  assert(errors.length === 0, errors.join("\n"));
  console.log(
    "PASS: source draft + completed 3D, controls, image failure/retry, task switching, locale, mobile sizing and empty draft; no submissions."
  );
}
