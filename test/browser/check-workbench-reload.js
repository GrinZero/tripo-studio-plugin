// Build and start i18n-server.mjs; all MCP responses are isolated fixtures.
async (page) => {
  const base = "http://127.0.0.1:43911";
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.request.get(`${base}/reset`);
  await page.goto(`${base}/?locale=zh-CN&codex=normalized`);
  await page
    .locator("#app")
    .evaluate((iframe) =>
      iframe.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-downloads"
      )
    );
  const frame = page.frameLocator("#app");
  await frame.locator("#appVersion:not(:disabled)").waitFor();
  await frame.locator("#language").selectOption("zh-CN");
  await frame.getByRole("tab", { name: "创建", exact: true }).click();
  const textarea = frame.locator("#characterName");
  await textarea.fill("Keep my draft </script> 日本語");
  const beforeCalls = (await (await page.request.get(`${base}/stats`)).json())
    .calls;
  await page.route(`${base}/latest-workbench`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        /(timestamp[:\s]+["'])\d{14}/g,
        "$120990101000000"
      ),
    });
  });
  await frame
    .getByRole("button", { name: "重新加载工作台", exact: true })
    .click();
  await frame
    .locator("#appVersionTimestamp")
    .filter({ hasText: "20990101000000" })
    .waitFor();
  await frame.locator("#appVersion:not(:disabled)").waitFor();
  assert(
    (await frame
      .getByRole("tab", { name: "创建", exact: true })
      .getAttribute("aria-selected")) === "true",
    "reload must preserve the current tab despite host input replay"
  );
  assert(
    (await textarea.inputValue()) === "Keep my draft </script> 日本語",
    "reload must preserve unsaved text safely"
  );
  assert(
    await page
      .locator("#app")
      .evaluate((iframe) =>
        iframe.contentWindow.location.href.startsWith("blob:")
      ),
    "reload must replace the document, not refresh catalog data"
  );
  await frame
    .getByRole("button", { name: "重新加载工作台", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await frame.locator("#appVersion:not(:disabled)").waitFor();
  assert(
    (await textarea.inputValue()) === "Keep my draft </script> 日本語",
    "repeated keyboard reload must preserve the draft"
  );
  await page.unroute(`${base}/latest-workbench`);
  await page.route(`${base}/latest-workbench`, (route) =>
    route.fulfill({ status: 503, body: "unavailable" })
  );
  await frame
    .getByRole("button", { name: "重新加载工作台", exact: true })
    .click();
  await frame.locator("#toast").filter({ hasText: "重新加载失败" }).waitFor();
  assert(
    (await textarea.inputValue()) === "Keep my draft </script> 日本語",
    "failed reads must keep the current document and draft"
  );
  assert(
    await frame.locator("#appVersion").isEnabled(),
    "failed reload must allow retry"
  );
  const calls = (
    await (await page.request.get(`${base}/stats`)).json()
  ).calls.slice(beforeCalls.length);
  assert(
    !calls.some((call) =>
      /tripo_(?:submit|generate|run_workflow)/.test(call.name)
    ),
    "reload must not stage or submit tasks"
  );
  await page.unroute(`${base}/latest-workbench`);
  assert(errors.length === 0, errors.join("\n"));
  console.log(
    "PASS: fresh resource, repeated and keyboard reload, current tab, unsaved draft, safe failure, no submissions."
  );
}
