// Isolated host; mirrors the real texture task's reference snapshot slot.
async (page) => {
  const base = "http://127.0.0.1:43911";
  await page.request.get(`${base}/reset`);
  await page.goto(`${base}/?card=texture-reference&locale=zh-CN`);
  const frame = page.frameLocator("#app");
  await frame.locator(".configuration").waitFor();
  await frame.locator(".source-picture img").waitFor({ timeout: 3000 });
  const image = frame.locator(".source-picture img");
  if (!(await image.evaluate((node) => node.complete && node.naturalWidth > 0)))
    throw Error("Texture reference image must be decoded and visible");
  const stats = await (await page.request.get(`${base}/stats`)).json();
  if (
    !stats.calls.some(
      (call) =>
        call.name === "tripo_ui_review" &&
        call.arguments.action === "preview" &&
        call.arguments.slot === "reference"
    )
  )
    throw Error("Texture card must request its frozen reference snapshot");
  if (stats.calls.some((call) => call.arguments.action === "edit"))
    throw Error("Loading the reference must not pause automatic submission");
  console.log("PASS: texture reference is visible without changing submission.");
}
