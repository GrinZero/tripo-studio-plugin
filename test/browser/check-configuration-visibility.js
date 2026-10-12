// Build, start node test/browser/i18n-server.mjs, then:
// playwright-cli run-code --filename test/browser/check-configuration-visibility.js
async (page) => {
  const base = "http://127.0.0.1:43911";
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("about:blank");
  await page.unroute(`${base}/?**`);
  await page.request.get(`${base}/reset`);
  await page.route(`${base}/?**`, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '<iframe id="app"',
      '<style id="hide-card">#app{display:none!important}</style><iframe id="app"'
    );
    await route.fulfill({ response, body });
  });
  await page.goto(`${base}/?card=configuration&locale=zh-CN`);
  const frame = page.frameLocator("#app");
  await frame.locator(".configuration").waitFor({ state: "attached" });
  await frame
    .locator(".source-picture img")
    .first()
    .waitFor({ state: "attached" });
  const hidden = await (await page.request.get(`${base}/stats`)).json();
  assert(
    Number.isFinite(hidden.review.deadline_at),
    "hidden mounted card must already have the creation deadline"
  );
  assert(
    !hidden.calls.some((call) => call.arguments?.action === "ready"),
    "hidden card must not acknowledge visibility"
  );
  await page.locator("#hide-card").evaluate((element) => element.remove());
  await page.unroute(`${base}/?**`);
  await frame
    .locator(".config-notice")
    .filter({ hasText: /\d+ 秒后自动提交/ })
    .waitFor();
  const shown = await (await page.request.get(`${base}/stats`)).json();
  assert(
    shown.review.deadline_at === hidden.review.deadline_at,
    "display must preserve the creation deadline"
  );
  assert(
    shown.calls.filter((call) => call.arguments?.action === "ready").length ===
      1,
    "display must acknowledge once"
  );
  // Cards can leave the viewport or be recreated when returning to the chat.
  await page.locator("#app").evaluate((element) => {
    element.style.marginTop = "200vh";
  });
  await page.waitForTimeout(1200);
  await page.locator("#app").evaluate((element) => {
    element.style.marginTop = "0";
  });
  await frame.locator(".configuration").waitFor({ state: "visible" });
  const scrolled = await (await page.request.get(`${base}/stats`)).json();
  assert(
    scrolled.review.deadline_at === shown.review.deadline_at,
    "scrolling back to the card must preserve its first deadline"
  );
  // The host may replay the original creation receipt when reopening the chat.
  await page.route(`${base}/result?**`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.structuredContent.review.deadline_at = hidden.review.deadline_at;
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await frame
    .locator(".config-notice")
    .filter({ hasText: /\d+ 秒后自动提交/ })
    .waitFor();
  const reopened = await (await page.request.get(`${base}/stats`)).json();
  assert(
    reopened.review.deadline_at === shown.review.deadline_at,
    "reopening the same card must preserve its first deadline"
  );
  const remaining = Number(
    (await frame.locator(".config-notice").textContent()).match(/\d+/)[0]
  );
  assert(remaining < 60, "reopening must display the remaining time");
  await page.unroute(`${base}/result?**`);
  // focus() emits trusted focus events too; mounting/restoring focus is not editing.
  await frame
    .getByRole("spinbutton", { name: "目标面数" })
    .evaluate((element) => element.focus());
  await frame
    .getByRole("button", { name: "8K", exact: true })
    .evaluate((element) => element.focus());
  await frame
    .getByRole("spinbutton", { name: "目标面数" })
    .evaluate((element) => {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
      );
    });
  await page.waitForTimeout(750);
  const untouched = await (await page.request.get(`${base}/stats`)).json();
  assert(
    untouched.review.status === "pending",
    "automatic focus and synthetic interaction must not pause an untouched card"
  );
  assert(
    untouched.review.deadline_at === shown.review.deadline_at,
    "automatic focus must preserve the original deadline"
  );
  assert(
    !untouched.calls.some((call) => call.arguments?.action === "edit"),
    "automatic focus must not send an edit request"
  );
  await frame.getByRole("spinbutton", { name: "目标面数" }).click();
  await frame.getByRole("spinbutton", { name: "目标面数" }).fill("060000");
  await frame.getByRole("button", { name: "4K", exact: true }).click();
  await page.waitForTimeout(750);
  const unchanged = await (await page.request.get(`${base}/stats`)).json();
  assert(
    unchanged.review.status === "pending" &&
      unchanged.review.deadline_at === shown.review.deadline_at,
    "clicks, equivalent numeric values and selecting the current option must preserve the countdown"
  );
  assert(
    !unchanged.calls.some((call) => call.arguments?.action === "edit"),
    "unchanged parameters must not send edit requests"
  );
  await frame.getByRole("spinbutton", { name: "目标面数" }).fill("24000");
  await frame
    .getByRole("button", { name: "保存并提交", exact: true })
    .waitFor();
  const edited = await (await page.request.get(`${base}/stats`)).json();
  assert(
    edited.review.status === "editing" && edited.review.deadline_at === null,
    "editing must pause server submission"
  );
  await frame.getByRole("button", { name: "保存并提交", exact: true }).click();
  await frame
    .getByText("任务已提交，可刷新查看结果。", { exact: true })
    .waitFor();
  const saved = await (await page.request.get(`${base}/stats`)).json();
  assert(
    saved.review.input.face_limit === 24000,
    "save must preserve the user selection"
  );
  assert(
    saved.review.status === "submitted" && saved.review.deadline_at === null,
    "save must submit immediately without a new edit window"
  );
  assert(
    saved.calls.filter((call) => call.arguments?.action === "ready").length ===
      reopened.calls.filter((call) => call.arguments?.action === "ready").length,
    "saving must not start another visibility/countdown window"
  );
  await page.request.get(`${base}/reset`);
  await page.reload();
  await frame
    .locator(".config-notice")
    .filter({ hasText: /\d+ 秒后自动提交/ })
    .waitFor();
  await frame.getByRole("spinbutton", { name: "目标面数" }).click();
  await page.waitForTimeout(750);
  const clicked = await (await page.request.get(`${base}/stats`)).json();
  assert(
    clicked.review.status === "pending" &&
      Number.isFinite(clicked.review.deadline_at),
    "real pointer interaction without a value change must keep counting down"
  );
  await page.request.get(`${base}/reset`);
  await page.reload();
  await frame
    .locator(".config-notice")
    .filter({ hasText: /\d+ 秒后自动提交/ })
    .waitFor();
  const faces = frame.getByRole("spinbutton", { name: "目标面数" });
  await faces.evaluate((element) => element.focus());
  await faces.press("Tab");
  await faces.evaluate((element) => element.focus());
  await faces.press("ArrowUp");
  await frame
    .locator(".countdown-helper")
    .filter({ hasText: "自动提交已暂停" })
    .waitFor();
  const keyed = await (await page.request.get(`${base}/stats`)).json();
  assert(
    keyed.review.status === "editing" && keyed.review.deadline_at === null,
    "keyboard editing must pause submission"
  );
  assert(errors.length === 0, errors.join("\n"));
  console.log(
    "PASS: focus/clicks/unchanged values preserve the countdown, actual edits pause, save submits immediately."
  );
}
