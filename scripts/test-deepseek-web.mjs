#!/usr/bin/env node
// Real DSH Web boot + production AppSurface + authenticated API + stdio runtime.
// A test-only DSH bundle supplies a surface and invokes only local/read-only tools;
// no model-provider key, Tripo login, or paid cloud request is needed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { solidImage } from "../test/helpers/image-fixture.mjs";
import { fixtureGlb } from "../test/helpers/glb-fixture.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const adapter = path.join(root, "packages/deepseek-adapter");
const require = createRequire(path.join(adapter, "package.json"));
const { chromium } = require("@playwright/test");
const dsh = path.join(
  path.dirname(require.resolve("@deepseek-ai/dsh/package.json")),
  "lib/bin.js"
);
const sandbox = await mkdtemp(path.join(tmpdir(), "tripo dsh web # "));
let child, browser;
try {
  const fixture = path.join(sandbox, "fixture");
  const profile = path.join(sandbox, "home/profiles/web");
  await mkdir(path.join(profile, "node_modules"), { recursive: true });
  await mkdir(fixture);
  await writeFile(
    path.join(fixture, "package.json"),
    JSON.stringify({
      name: "tripo-webtest",
      version: "1.0.0",
      type: "module",
      main: "host.mjs",
      exports: {
        ".": "./host.mjs",
        "./client": "./client.js",
        "./package.json": "./package.json",
      },
      dsh: {
        bundle: { patch: "./cordis.patch.yml" },
        client: {
          platform: "web",
          external: ["tripo-studio-deepseek/client"],
          inject: ["tripo-studio-deepseek"],
        },
      },
    })
  );
  await writeFile(
    path.join(fixture, "cordis.patch.yml"),
    "- insert:\n    - id: tripo-webtest\n      name: tripo-webtest\n"
  );
  await writeFile(
    path.join(fixture, "host.mjs"),
    `
export const inject = ["connection", "tools"];
export function apply(ctx) {
  ctx.connection.fetch.register({path:"/api/tripo-webtest",methods:["POST"],requestBody:"buffered",async fetch(request){
    const {name,args={},callId="web-call"}=await request.json();
    if(!["tripo_auth_status","tripo_crop_image","tripo_get_configuration_review","tripo_task_wait","tripo_download","tripo_show_result"].includes(name))return new Response("Not a local test tool",{status:403});
    try{return Response.json(await ctx.tools.get("mcp__tripo-studio__"+name).execute(args,{agent:{id:"web-test",session:{id:"web-test"}},callId,signal:request.signal}));}
    catch(e){return Response.json({error:e.message},{status:400});}
  }});
}
`
  );
  const fixtureSource = `
import React from "react";
import {createRoot} from "react-dom/client";
import {AppSurface} from "tripo-studio-deepseek/client";
export const inject=["slots","connection","locale","theme"];
export function apply(ctx){
  const element=document.createElement("div");element.id="tripo-test-surface";element.style.cssText="position:fixed;inset:0;z-index:99999;background:white";document.body.append(element);
  const root=createRoot(element);
  window.__TRIPO_WEB_TEST__={
    initialized:0,
    mount(surface,callId){root.render(React.createElement(AppSurface,{ctx,sessionId:"web-test",surface,callId,onInitialized(){window.__TRIPO_WEB_TEST__.initialized++;}}));},
    theme(value){return ctx.theme.setTheme(value);},
    locale(value){return ctx.locale.setLocale(value);},
    slots(){return ctx.slots.entries("tool.call.toolview").map(entry=>entry.options.key);}
  };
  ctx.effect(()=>()=>{root.unmount();element.remove();delete window.__TRIPO_WEB_TEST__;});
}
`;
  await build({
    stdin: {
      contents: fixtureSource,
      resolveDir: root,
      sourcefile: "tripo-webtest.mjs",
    },
    outfile: path.join(fixture, "client.js"),
    bundle: true,
    format: "cjs",
    platform: "browser",
    external: ["react", "react-dom/client", "tripo-studio-deepseek/client"],
    banner: {
      js: 'globalThis.__ModuleLoader__.load({id:"tripo-webtest",factory(require){var module={exports:{}};var exports=module.exports;',
    },
    footer: { js: "return module.exports;}});" },
  });
  await symlink(
    adapter,
    path.join(profile, "node_modules/tripo-studio-deepseek"),
    "dir"
  );
  await symlink(
    fixture,
    path.join(profile, "node_modules/tripo-webtest"),
    "dir"
  );
  await writeFile(
    path.join(profile, "package.json"),
    JSON.stringify({
      name: "tripo-web-test-profile",
      private: true,
      dependencies: {
        "tripo-studio-deepseek": `link:${adapter}`,
        "tripo-webtest": `link:${fixture}`,
      },
      dsh: {
        profile: {
          bundles: [
            "@deepseek-ai/dsh-base",
            "@deepseek-ai/dsh-web-app",
            "tripo-studio-deepseek",
            "tripo-webtest",
          ],
        },
      },
    })
  );
  await writeFile(path.join(profile, "cordis.yml"), "[]\n");
  await writeFile(
    path.join(profile, "cordis.patch.yml"),
    `- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(path.join(sandbox, "documents"))}\n`
  );
  child = spawn(process.execPath, [dsh, "web", "--no-open", "--port", "0"], {
    cwd: root,
    env: {
      ...process.env,
      DSH_HOME: path.join(sandbox, "home"),
      TRIPO_PLUGIN_DATA_DIR: path.join(sandbox, "data"),
      TRIPO_ASSET_ROOT: path.join(sandbox, "assets"),
      TRIPO_OUTPUT_ROOTS: path.join(sandbox, "assets"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("DSH Web did not start within 45 seconds.")),
      45000
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (bytes) => {
        logs = (logs + bytes.toString()).slice(-20000);
        const match = logs.match(
          /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/
        );
        if (match) {
          clearTimeout(timeout);
          resolve(match[0]);
        }
      });
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `DSH exited (${code}): ${logs.replace(/token=[A-Za-z0-9_-]+/g, "token=[redacted]")}`
        )
      );
    });
  });
  browser = await chromium.launch({
    ...(process.env.TRIPO_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.TRIPO_CHROMIUM_EXECUTABLE }
      : {}),
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__TRIPO_WEB_TEST__ !== undefined);
  const api = (body) =>
    page.evaluate(async (body) => {
      const response = await fetch("api/tripo-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, value: await response.json() };
    }, body);
  assert.equal((await api({ action: "catalog" })).value.tools.length, 62);
  assert.equal(
    (await page.evaluate(() => window.__TRIPO_WEB_TEST__.slots())).filter(
      (name) => name?.startsWith("mcp__tripo-studio__")
    ).length,
    62
  );
  const status = await page.request.post(
    new URL("/api/tripo-studio", url).href,
    { data: { action: "catalog" } }
  );
  assert.equal(status.status(), 200);
  // A separate unauthenticated context must not reach the plugin route.
  const outsider = await browser.newContext();
  assert.equal(
    (
      await outsider.request.post(new URL("/api/tripo-studio", url).href, {
        data: { action: "catalog" },
      })
    ).status(),
    401
  );
  await outsider.close();
  const invoke = (name, args = {}, callId = "web-call") =>
    page.evaluate(
      async ({ name, args, callId }) => {
        const response = await fetch("api/tripo-webtest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, args, callId }),
        });
        return { status: response.status, value: await response.json() };
      },
      { name, args, callId }
    );
  assert.match(
    (await invoke("tripo_crop_image", {}, "not-ready")).value.error,
    /UI_UNAVAILABLE/
  );
  await page.evaluate(() => window.__TRIPO_WEB_TEST__.mount("workbench"));
  const frame = page.frameLocator("#tripo-test-surface iframe");
  await frame.locator("#appVersion").waitFor();
  await page.waitForFunction(() => window.__TRIPO_WEB_TEST__.initialized >= 1);
  await frame.locator("#connection").waitFor({ state: "hidden" });
  await frame.getByText("Tripo", { exact: false }).first().waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("#tripo-test-surface iframe")?.contentWindow !==
      null
  );
  const workbench = await api({
    action: "attach",
    sessionId: "web-test",
    surface: "workbench",
  });
  await api({ action: "ready", token: workbench.value.token });
  const png = await solidImage({
    width: 16,
    height: 12,
    background: "#aa8855",
  });
  const image = await api({
    action: "callTool",
    token: workbench.value.token,
    name: "tripo_ui_import_image",
    arguments: { name: "fixture.png", data_base64: png.toString("base64") },
  });
  const created = await invoke(
    "tripo_crop_image",
    {
      image_path: image.value.structuredContent.file_path,
      left: 0,
      top: 0,
      width: 8,
      height: 6,
    },
    "crop-web"
  );
  assert.equal(created.status, 200);
  assert.equal(created.value._meta, undefined);
  const review = created.value.structuredContent.review;
  assert.equal(review.auto_submit, true);
  await page.evaluate(() =>
    window.__TRIPO_WEB_TEST__.mount("card", "crop-web")
  );
  const card = page.frameLocator("#tripo-test-surface iframe");
  await card.locator("#cardVersion").waitFor();
  // Use the actual production form rather than submitting through the test seam.
  const cancel = card.getByRole("button", { name: /取消|Cancel/i }).first();
  await cancel.waitFor();
  await cancel.click();
  const canceled = await invoke(
    "tripo_get_configuration_review",
    { review_id: review.review_id },
    "read-canceled"
  );
  assert.equal(canceled.value.structuredContent.review.status, "canceled");
  const edited = await invoke(
    "tripo_crop_image",
    {
      image_path: image.value.structuredContent.file_path,
      left: 0,
      top: 0,
      width: 9,
      height: 6,
    },
    "crop-edited"
  );
  await page.evaluate(() =>
    window.__TRIPO_WEB_TEST__.mount("card", "crop-edited")
  );
  await card.locator("#cardVersion").waitFor();
  const widthInput = card.locator('input[data-field="width"]');
  await widthInput.waitFor({ state: "attached" });
  await card.locator("details").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.open = true;
    })
  );
  await widthInput.fill("7");
  const editId = edited.value.structuredContent.review.review_id;
  let paused;
  for (let i = 0; i < 40; i++) {
    paused = await invoke(
      "tripo_get_configuration_review",
      { review_id: editId },
      "read-editing"
    );
    if (paused.value.structuredContent.review.status === "editing") break;
    await page.waitForTimeout(100);
  }
  assert.equal(paused.value.structuredContent.review.status, "editing");
  assert.equal(paused.value.structuredContent.review.deadline_at, null);
  await card.getByRole("button", { name: /保存并提交|Save.*submit/i }).click();
  let submitted;
  for (let i = 0; i < 60; i++) {
    submitted = await invoke(
      "tripo_get_configuration_review",
      { review_id: editId },
      "read-saved"
    );
    if (submitted.value.structuredContent.review.status === "submitted") break;
    await page.waitForTimeout(100);
  }
  assert.equal(
    submitted.value.structuredContent.review.status,
    "submitted",
    JSON.stringify({
      review: submitted.value.structuredContent.review,
      visible: await card.locator("body").innerText(),
      invalid: await card
        .locator("input:invalid,textarea:invalid,select:invalid")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            field: node.dataset.field,
            message: node.validationMessage,
          }))
        ),
    })
  );
  assert.equal(submitted.value.structuredContent.review.input.width, 7);
  await page.evaluate(() => window.__TRIPO_WEB_TEST__.theme("dark"));
  await card.locator('html[data-theme="dark"]').waitFor();
  await page.setViewportSize({ width: 420, height: 800 });
  assert.equal(
    await card
      .locator("body")
      .evaluate((body) => body.scrollWidth <= window.innerWidth + 1),
    true
  );
  await page.evaluate(() => {
    window.__TRIPO_CARRIER_CALLS__ = 0;
    window.__DSH_TRANSPORT__ = {
      fetch(input, init) {
        window.__TRIPO_CARRIER_CALLS__++;
        return fetch(input, init);
      },
    };
    window.__TRIPO_WEB_TEST__.mount("workbench");
  });
  await page
    .frameLocator("#tripo-test-surface iframe")
    .locator("#appVersion")
    .waitFor();
  await page.waitForFunction(() => window.__TRIPO_WEB_TEST__.initialized >= 3);
  await page
    .frameLocator("#tripo-test-surface iframe")
    .locator("#connection")
    .waitFor({ state: "hidden" });
  assert.ok(await page.evaluate(() => window.__TRIPO_CARRIER_CALLS__ > 0));
  const automatic = await invoke(
    "tripo_crop_image",
    {
      image_path: image.value.structuredContent.file_path,
      left: 0,
      top: 0,
      width: 6,
      height: 5,
    },
    "crop-automatic"
  );
  const autoReview = automatic.value.structuredContent.review;
  assert.equal(autoReview.auto_submit, true);
  console.log(
    "DeepSeek Web: checking the real 60-second local countdown with its card unmounted (no cloud request)."
  );
  let completed;
  const until = Date.now() + 75000;
  while (Date.now() < until) {
    completed = await invoke(
      "tripo_get_configuration_review",
      { review_id: autoReview.review_id },
      "read-automatic"
    );
    if (completed.value.structuredContent.review.status === "submitted") break;
    await page.waitForTimeout(1000);
  }
  assert.equal(completed.value.structuredContent.review.status, "submitted");
  const taskId = completed.value.structuredContent.task.task_id;
  const finished = await invoke(
    "tripo_task_wait",
    { task_id: taskId, timeout_seconds: 10 },
    "wait-local"
  );
  assert.equal(finished.value.structuredContent.task.status, "succeeded");
  const downloaded = await invoke(
    "tripo_download",
    {
      task_id: taskId,
      output_path: path.join(sandbox, "assets", "delivered.png"),
    },
    "download-local"
  );
  assert.equal(downloaded.status, 200);
  assert.ok(downloaded.value.structuredContent.download.bytes > 0);
  const modelPath = path.join(sandbox, "assets", "local-model.glb");
  await writeFile(modelPath, fixtureGlb());
  const shown = await invoke(
    "tripo_show_result",
    { local_path: modelPath },
    "model-preview"
  );
  assert.equal(shown.status, 200);
  assert.equal(shown.value._meta, undefined);
  await page.evaluate(() =>
    window.__TRIPO_WEB_TEST__.mount("card", "model-preview")
  );
  const model = card.locator("model-viewer");
  await model.waitFor();
  await model.evaluate((element) =>
    element.loaded
      ? undefined
      : new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("GLB preview did not load.")),
            20000
          );
          element.addEventListener(
            "load",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
          element.addEventListener(
            "error",
            () => {
              clearTimeout(timer);
              reject(new Error("GLB preview failed."));
            },
            { once: true }
          );
        })
  );
  assert.equal(await model.evaluate((element) => element.loaded), true);
  const orbit = await model.evaluate(
    (element) => element.getCameraOrbit().theta
  );
  const box = await model.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.notEqual(
    await model.evaluate((element) => element.getCameraOrbit().theta),
    orbit
  );
  await page.evaluate(() => window.__TRIPO_WEB_TEST__.locale("ja"));
  await card.locator('html[lang="ja"]').waitFor();
  assert.deepEqual(errors, []);
  if (process.env.TRIPO_WEB_SCREENSHOT)
    await page.screenshot({
      path: process.env.TRIPO_WEB_SCREENSHOT,
      fullPage: true,
    });
  console.log(
    "DeepSeek Web: real DSH boot, authenticated route, 62 tool views, embedded workbench/card, readiness gate, edit/save/cancel, unmounted 60-second submission, local result/download, interactive GLB preview, theme/locale, narrow layout and Desktop-style Fetch carrier passed. No cloud credits used."
  );
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000).unref();
    });
  }
  await rm(sandbox, { recursive: true, force: true });
}
