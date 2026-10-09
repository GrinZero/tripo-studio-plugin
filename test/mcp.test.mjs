import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import sharp from "sharp";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

// Minimal stdio JSON-RPC client for handshake tests.
function mcpClient(proc) {
  let id = 0;
  const pending = new Map();
  let buffer = "";
  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    for (;;) {
      const line = buffer.indexOf("\n");
      if (line < 0) break;
      const raw = buffer.slice(0, line);
      buffer = buffer.slice(line + 1);
      if (!raw.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  return {
    request(method, params) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        let timer;
        pending.set(requestId, (msg) => { clearTimeout(timer); return msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); });
        proc.stdin.write(`${JSON.stringify({ id: requestId, jsonrpc: "2.0", method, params })}\n`);
        timer = setTimeout(() => {
          if (pending.has(requestId)) {
            pending.delete(requestId);
            reject(new Error(`timeout waiting for ${method}`));
          }
        }, 20000);
      });
    },
    notify(method, params) {
      proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    }
  };
}

describe("mcp handshake", () => {
  it("initializes and lists all registered tools", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "tripo-mcp-"));
    const proc = spawn(process.execPath, [path.join(root, "mcp", "bootstrap.mjs")], {
      env: { ...process.env, TRIPO_PLUGIN_DATA_DIR: dataDir, TRIPO_ASSET_ROOT: path.join(dataDir, "assets") },
      stdio: ["pipe", "pipe", "pipe"]
    });
    try {
      const client = mcpClient(proc);
      const init = await client.request("initialize", {
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.1" },
        protocolVersion: "2024-11-05"
      });
      assert.equal(init.serverInfo.name, "tripo-studio-plugin");
      client.notify("notifications/initialized", {});
      const tools = await client.request("tools/list", {});
      const names = tools.tools.map((t) => t.name).sort();
      for (const expected of [
        "tripo_auth_login", "tripo_auth_status", "tripo_auth_logout", "tripo_auth_import", "tripo_get_payment",
        "tripo_list_models", "tripo_get_model", "tripo_list_image_assets", "tripo_get_image_asset",
        "tripo_list_image_templates", "tripo_list_animation_presets", "tripo_list_operations",
        "tripo_generate_image", "tripo_generate_multiview", "tripo_regenerate_image",
        "tripo_generate_model", "tripo_import_model", "tripo_segment_model", "tripo_complete_parts",
        "tripo_remesh_model", "tripo_generate_texture", "tripo_preview_texture_edit",
        "tripo_apply_texture_edits", "tripo_upscale_texture", "tripo_generate_pbr",
        "tripo_rig_model", "tripo_animate_model",
        "tripo_submit_task", "tripo_task_sync", "tripo_task_wait", "tripo_task_cancel",
        "tripo_task_reconcile", "tripo_list_tasks", "tripo_get_task",
        "tripo_download", "tripo_run_workflow", "tripo_open_in_studio"
      ]) {
        assert.ok(names.includes(expected), `missing tool ${expected}`);
      }
      assert.equal(names.length, 67);
      for(const name of ['tripo_list_asset_groups','tripo_list_group_assets','tripo_create_asset_group','tripo_set_asset_group','tripo_rename_asset_group']) {
        const registered=tools.tools.find(t=>t.name===name);
        assert.ok(registered,`missing agent asset group tool ${name}`);
        assert.deepEqual(registered._meta.ui.visibility,['model','app']);
        assert.equal(registered._meta.ui.resourceUri,undefined);
      }
      assert.ok(names.includes("tripo_quote_operation"));
      for (const name of ["tripo_generate_uv", "tripo_apply_uv", "tripo_export_model", "tripo_generate_motion", "tripo_apply_motion", "tripo_get_uv_context", "tripo_list_motions", "tripo_get_motion", "tripo_upscale_image", "tripo_split_image", "tripo_render_model", "tripo_edit_parts", "tripo_bake_texture_projection", "tripo_paint_texture", "tripo_crop_image", "tripo_inspect_local_parts"]) assert.ok(names.includes(name), `missing tool ${name}`);
      assert.equal(init.serverInfo.version, "0.3.3");
      for (const name of ["tripo_ui_preview", "tripo_ui_import_image", "tripo_ui_review", "tripo_ui_asset_library"]) assert.deepEqual(tools.tools.find(t => t.name === name)._meta.ui.visibility, ["app"]);
      for (const name of ['tripo_auth_login','tripo_auth_status','tripo_auth_logout','tripo_get_payment','tripo_quote_operation','tripo_list_operations','tripo_list_models','tripo_get_model','tripo_list_image_assets','tripo_get_image_asset','tripo_submit_task','tripo_task_sync','tripo_task_wait','tripo_task_cancel','tripo_task_reconcile','tripo_list_tasks','tripo_get_task','tripo_download','tripo_list_task_groups','tripo_set_task_character','tripo_inspect_local_parts','tripo_run_workflow','tripo_open_in_studio']) {
        const t=tools.tools.find(t=>t.name===name);
        assert.equal(t._meta.ui.resourceUri, undefined, `${name} must preserve the current preview`);
        assert.deepEqual(t._meta.ui.visibility,['model','app']);
      }
      for (const name of ['tripo_generate_model','tripo_generate_image','tripo_export_model','tripo_crop_image','tripo_show_result']) {
        assert.equal(tools.tools.find(t=>t.name===name)._meta.ui.resourceUri, "ui://tripo-studio/result-card-v2.html");
      }
      const card = await client.request("resources/read", { uri: "ui://tripo-studio/result-card-v2.html" });
      assert.equal(card.contents[0].mimeType, "text/html;profile=mcp-app");
      assert.equal(card.contents[0]._meta["openai/ui"].preferredDisplayMode, "inline");
      assert.ok(card.contents[0].text.includes("Tripo 工具结果"));
      assert.ok(!card.contents[0].text.includes("<!-- CARD_SCRIPT -->"));
      const pixels = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#cc7755" } }).png().toBuffer();
      const imported = await client.request("tools/call", { name: "tripo_ui_import_image", arguments: { name: "fixture.png", data_base64: pixels.toString("base64") } });
      assert.equal(imported.isError, undefined);
      assert.ok(imported._meta.tripo.preview.data_url.startsWith("data:image/webp;base64,"));
      assert.ok(!JSON.stringify(imported.structuredContent).includes("data:image"));
      const preview = await client.request("tools/call", { name: "tripo_ui_preview", arguments: { input_id: imported.structuredContent.input_id, type: "image" } });
      assert.equal(preview.isError, undefined);
      assert.equal(preview._meta.tripo.preview.width, 32);
      const open = tools.tools.find(t => t.name === "tripo_open_workbench");
      assert.equal(open.icons[0].mimeType, "image/png");
      assert.ok(open.icons[0].src.startsWith("data:image/png;base64,"));
      const iconBytes = Buffer.from(open.icons[0].src.split(",")[1], "base64");
      assert.deepEqual(iconBytes, await readFile(path.join(root, "ui", "tripo-logo.png")));
      assert.equal((await sharp(iconBytes).metadata()).width, 60);
      assert.deepEqual(init.serverInfo.icons, open.icons);
      assert.equal(open.title, "Tripo 工作台");
      assert.deepEqual(open._meta["openai/ui"].entrypoints, [{ type: "global" }, { type: "thread" }]);
      const resources = await client.request("resources/list", {});
      const ui = resources.resources.find(r => r.uri === open._meta.ui.resourceUri);
      assert.equal(ui.mimeType, "text/html;profile=mcp-app");
      const contents = await client.request("resources/read", { uri: ui.uri });
      assert.equal(contents.contents[0].mimeType, ui.mimeType);
      assert.ok(contents.contents[0].text.includes("ui/initialize"));
      assert.ok(!contents.contents[0].text.includes("<!-- WORKBENCH_SCRIPT -->"));
      const opened = await client.request("tools/call", { name: "tripo_open_workbench", arguments: {} });
      assert.equal(opened.structuredContent.view, "assets");
      assert.equal(opened.structuredContent.session.authenticated, false);
      const model = tools.tools.find(t => t.name === "tripo_generate_model");
      assert.ok(model.inputSchema.properties.character_name);
      assert.ok(model.inputSchema.properties.parent_task_id);
      assert.ok(names.includes('tripo_list_task_groups'));
      assert.ok(names.includes('tripo_set_task_character'));
      const groupedCrop = await client.request('tools/call',{name:'tripo_crop_image',arguments:{image_path:imported.structuredContent.file_path,left:0,top:0,width:16,height:16,character_name:'派蒙',submit:true}});
      assert.equal(groupedCrop.isError,undefined);
      assert.equal(groupedCrop.structuredContent.task.character_group.name,'派蒙');
      const completedCrop = await client.request('tools/call',{name:'tripo_task_wait',arguments:{task_id:groupedCrop.structuredContent.task.task_id,timeout_seconds:10,poll_seconds:1}});
      assert.equal(completedCrop.structuredContent.task.status,'succeeded');
      assert.equal(completedCrop._meta.tripo.presentation,'data');
      assert.equal(groupedCrop._meta.tripo.presentation,'card');
      const shown=await client.request('tools/call',{name:'tripo_show_result',arguments:{task_id:groupedCrop.structuredContent.task.task_id}});
      assert.equal(shown._meta.tripo.presentation,'card');
      assert.equal(shown.structuredContent.task.status,'succeeded');
      assert.deepEqual(shown.structuredContent.preview_target,{task_id:groupedCrop.structuredContent.task.task_id,type:'image',output_index:0});
      const ambiguous=await client.request('tools/call',{name:'tripo_show_result',arguments:{task_id:groupedCrop.structuredContent.task.task_id,project_id:'other'}});
      assert.equal(ambiguous.isError,true);
      assert.equal(ambiguous.structuredContent.error.code,'INVALID_INPUT');
      const savedCrop = await client.request('tools/call',{name:'tripo_download',arguments:{task_id:groupedCrop.structuredContent.task.task_id,artifact:'image'}});
      assert.equal(savedCrop.isError,undefined,savedCrop.content[0].text);
      assert.equal(savedCrop._meta.tripo.presentation,'data');
      assert.match(savedCrop.content[0].text,/下载完成/);
      assert.ok(!savedCrop.content[0].text.startsWith('{'));
      const savedPreview = await client.request('tools/call',{name:'tripo_ui_preview',arguments:{local_path:savedCrop.structuredContent.download.path,type:'image'}});
      assert.equal(savedPreview.isError,undefined);
      assert.equal(savedPreview._meta.tripo.preview.width,16);
      assert.equal(savedPreview._meta.tripo.preview.height,16);
      const afterDownload=await client.request('tools/call',{name:'tripo_get_task',arguments:{task_id:groupedCrop.structuredContent.task.task_id}});
      assert.equal(afterDownload._meta.tripo.presentation,'data');
      assert.equal(afterDownload.structuredContent.task.downloads[0].path,savedCrop.structuredContent.download.path);
      assert.equal(afterDownload.structuredContent.task.downloads[0].artifact,'image');
      const savedCard=await client.request('tools/call',{name:'tripo_show_result',arguments:{local_path:savedCrop.structuredContent.download.path}});
      assert.equal(savedCard.isError,undefined);
      assert.equal(savedCard.structuredContent.preview_target.type,'image');
      const forbiddenCard=await client.request('tools/call',{name:'tripo_show_result',arguments:{local_path:'/tmp/escape.png'}});
      assert.equal(forbiddenCard.isError,true);
      const groupList = await client.request('tools/call',{name:'tripo_list_task_groups',arguments:{}});
      assert.equal(groupList.structuredContent.groups[0].total,1);
      const regrouped = await client.request('tools/call',{name:'tripo_set_task_character',arguments:{task_id:groupedCrop.structuredContent.task.task_id,character_name:'旅行者'}});
      assert.equal(regrouped.structuredContent.task.character_group.name,'旅行者');
      assert.equal(regrouped.structuredContent.task.request_hash,groupedCrop.structuredContent.task.request_hash);
      const filtered = await client.request('tools/call',{name:'tripo_list_tasks',arguments:{character_group_id:regrouped.structuredContent.task.character_group.id}});
      assert.equal(filtered.structuredContent.tasks.length,1);
      assert.ok(model.inputSchema.properties.delight);
      assert.ok(model.inputSchema.properties.model_version.enum.includes("Nexus-v2.0-20260801"));
      const operations = await client.request("tools/call", { arguments: {}, name: "tripo_list_operations" });
      assert.equal(operations.structuredContent.operations.length, 28);
      assert.match(operations.content[0].text, /28 项可用功能/);
      assert.ok(!operations.content[0].text.includes('"operations"'));
      const quote = await client.request("tools/call", { name: "tripo_quote_operation", arguments: { kind: "model.export" } });
      assert.equal(quote.structuredContent.quote.estimated_credits, 0);
      assert.match(quote.content[0].text, /0 积分/);
      assert.equal(quote.structuredContent.quote.paid_request_sent, false);
      const unknownQuote = await client.request("tools/call", { name: "tripo_quote_operation", arguments: { kind: "motion.generate" } });
      assert.equal(unknownQuote.structuredContent.quote.estimated_credits, null);
      assert.equal(unknownQuote.structuredContent.quote.status, "unknown");
      assert.match(unknownQuote.content[0].text, /待确认/);
      const invalidQuote = await client.request("tools/call", { name: "tripo_quote_operation", arguments: { kind: "image.generate", input: { submit: true } } });
      assert.equal(invalidQuote.isError, true);
      // every tool has a description and an object input schema
      for (const t of tools.tools) {
        assert.ok(t.description?.length > 10, `${t.name} needs a real description`);
        assert.equal(t.inputSchema.type, "object");
      }
      // auth-free tool works without login: structured error, not a crash
      const result = await client.request("tools/call", { arguments: {}, name: "tripo_auth_status" });
      assert.equal(result.structuredContent.session.authenticated, false);
      // Exercise the distributed worker lookup, not only the source implementation.
      const blender = process.env.TRIPO_BLENDER_EXECUTABLE ?? (process.platform === "darwin" ? "/Applications/Blender.app/Contents/MacOS/Blender" : null);
      if (blender && await access(blender).then(() => true, () => false)) {
        const modelPath = path.join(dataDir, "fixture.glb");
        await writeFile(modelPath, await readFile(new URL('./fixtures/meshopt-planes.glb', import.meta.url)));
        const staged = await client.request("tools/call", { name: "tripo_inspect_local_parts", arguments: { model_path: modelPath, submit: true } });
        assert.equal(staged.isError, undefined);
        assert.equal(staged.structuredContent.paid_request_sent, false);
        assert.equal(staged.structuredContent.task.cost_estimate.estimated_credits, 0);
        const done = await client.request("tools/call", { name: "tripo_task_sync", arguments: { task_id: staged.structuredContent.task.task_id } });
        assert.equal(done.structuredContent.task.status, "succeeded");
        assert.equal(done.structuredContent.task.result.parts.length, 2);
        assert.equal(done.structuredContent.task.result.parts[0].uv_utilization.fraction, 1);
      }
    } finally {
      proc.kill("SIGKILL");
      await rm(dataDir, { force: true, recursive: true }).catch(() => {});
    }
  }, 30000);
});
