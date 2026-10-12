// Isolated MCP host; no Studio generation or billing.
// Build, start node test/browser/i18n-server.mjs, then run through playwright-cli.
async (page) => {
  const base = "http://127.0.0.1:43911";
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.unroute(`${base}/?**`);
  await page.request.get(`${base}/reset`);
  await page.goto(`${base}/?card=manual-draft&locale=zh-CN`);
  const frame = page.frameLocator("#app");
  await frame.locator(".configuration").waitFor();
  assert(
    (await frame.getByRole("spinbutton", { name: "目标面数" }).inputValue()) ===
      "60000",
    "old draft must show its saved configuration"
  );
  assert(
    (await frame
      .getByRole("status")
      .filter({ hasText: "草稿配置，确认后提交" })
      .count()) === 1,
    "manual form must describe its confirmation mode"
  );
  assert(
    await frame.locator(".countdown-track").isHidden(),
    "manual draft must not show a countdown"
  );
  assert(
    (await frame.getByRole("button", { name: "刷新任务" }).count()) === 0,
    "draft form must replace the empty task card"
  );
  let stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    stats.calls.some(
      (call) =>
        call.name === "tripo_ui_review" &&
        call.arguments?.review_id === "legacy-draft" &&
        call.arguments?.action === "get"
    ),
    "must reopen the existing draft handle"
  );
  assert(
    stats.calls.some((call) => call.arguments?.action === "ready"),
    "display must acknowledge visibility for background preupload"
  );
  assert(
    stats.review.deadline_at === null,
    "legacy manual form must not arm a deadline on display"
  );
  await frame.getByRole("spinbutton", { name: "目标面数" }).fill("24000");
  await frame.getByRole("button", { name: "保存并提交", exact: true }).click();
  await frame
    .getByText("任务已提交，可刷新查看结果。", { exact: true })
    .waitFor();
  stats = await (await page.request.get(`${base}/stats`)).json();
  assert(
    stats.review.input.face_limit === 24000 &&
      stats.review.status === "submitted" &&
      stats.review.deadline_at === null,
    "saving must submit the edited settings immediately"
  );
  assert(
    !stats.calls.some(
      (call) =>
        ["confirm"].includes(call.arguments?.action) ||
        call.name === "tripo_generate_model" ||
        call.name === "tripo_submit_task"
    ),
    "saving must not stage another task or require a second confirmation"
  );
  await page.screenshot({
    path: "output/playwright/draft-configuration.png",
    fullPage: true,
  });
  assert(errors.length === 0, errors.join("\n"));
  console.log(
    "PASS: existing draft shows editable configuration; display starts background preparation; saving submits the existing draft."
  );
}
