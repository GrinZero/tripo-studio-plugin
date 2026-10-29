// Start i18n-server.mjs after building, then run with:
// playwright-cli run-code --filename test/browser/check-asset-loading.js
async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  let complete = false,
    syncing = true,
    failure = null,
    requests = 0,
    searchRequests = 0;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/rpc", async (route) => {
    const call = route.request().postDataJSON();
    if (call.name !== "tripo_ui_asset_library") return route.continue();
    requests++;
    const args = call.arguments;
    assert(args.progressive === true, "UI must request progressive results");
    if (args.search) searchRequests++;
    const entries = args.search && !complete ? [] : [{
      entry_type: "asset", project_id: "first", name: "First model",
      visibility: "private", created_at: "2026-10-29T00:00:00Z",
    }];
    await route.fulfill({ json: { structuredContent: {
      entries, groups: [], group: null, total: entries.length,
      next_offset: null, complete, syncing, sync_error: failure,
    } } });
  });
  try {
    await page.goto("http://127.0.0.1:43911/?locale=zh-CN&assets=1");
    const frame = page.frameLocator("#app");
    await frame.getByRole("button", { name: "选择 First model", exact: true }).waitFor();
    assert(!complete, "first card appears before completion");
    assert(await frame.getByRole("button", { name: "下一页", exact: true }).isDisabled(), "partial catalog cannot page");
    assert((await frame.locator(".asset-count").innerText()).includes("+"), "partial count must be labelled");
    await frame.locator(".asset-card").evaluate((node) => { node.dataset.retained = "yes"; });
    const initialRequests = requests;
    await page.waitForResponse((response) => response.url().endsWith("/rpc") && requests > initialRequests);
    assert(await frame.locator('.asset-card[data-retained="yes"]').count() === 1, "unchanged polls must preserve DOM");
    await frame.getByRole("textbox", { name: "搜索资产或分组" }).fill("Missing");
    await frame.getByRole("heading", { name: "正在加载资产", exact: true }).waitFor();
    assert(!await frame.getByText("未找到匹配的资产", { exact: true }).count(), "partial search cannot claim no match");
    const searches = searchRequests;
    complete = true;
    syncing = false;
    await frame.getByRole("button", { name: "选择 First model", exact: true }).waitFor();
    assert(searchRequests > searches, "search completes automatically");
    assert(await frame.getByRole("textbox", { name: "搜索资产或分组" }).inputValue() === "Missing", "poll must preserve query");
    syncing = true;
    await frame.getByRole("button", { name: "刷新当前页面" }).click();
    await frame.getByText("正在后台更新资产，当前显示上次完整结果。", { exact: true }).waitFor();
    assert(await frame.locator(".asset-card").count() === 1, "refresh keeps cached cards");
    assert(await frame.locator(".skeleton").count() === 0, "refresh does not replace cards with skeletons");
    syncing = false;
    failure = "Mock later-page failure";
    await frame.getByText(/资产更新失败，已保留当前结果。/).waitFor();
    assert(await frame.locator(".asset-card").count() === 1, "failure keeps cached cards");
    await frame.getByRole("tab", { name: "创建", exact: true }).click();
    await frame.getByRole("heading", { name: "创建 3D 模型", exact: true }).waitFor();
    assert(await frame.locator(".asset-card").count() === 0, "navigation leaves the library");
    assert(errors.length === 0, errors.join("\n"));
    console.log(JSON.stringify({ passed: true, requests, searchRequests }));
  } finally {
    await page.unroute("**/rpc");
  }
}
