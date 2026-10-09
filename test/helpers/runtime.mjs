import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionManager } from "../../src/auth/session.mjs";
import { TaskStore } from "../../src/store/tasks.mjs";
import { OperationService } from "../../src/ops/service.mjs";
export function jwt(expSeconds, sub = "user-1") {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ exp: expSeconds, sub })}.${b64({ sig: 1 })}`;
}

export function makeConfig(dir) {
  return {
    assetRoot: path.join(dir, "assets"),
    dataDir: dir,
    outputRoots: [path.join(dir, "assets")],
    planTtlMs: 30 * 60 * 1000,
    requestTimeoutMs: 5000
  };
}

export async function makeRuntime() {
  const dir = await mkdtemp(path.join(tmpdir(), "tripo-svc-"));
  const config = makeConfig(dir);
  const session = new SessionManager(config);
  await session.set({ authorization: `Bearer ${jwt(Math.floor(Date.now() / 1000) + 3600)}`, deviceId: "dev-1", region: "rg1" });
  const store = new TaskStore(dir);
  const calls = [];
  const gateway = {
    calls,
    project: { id: "proj-1", operator: {}, status: "success" },
    progress: [{ operator_id: "op-1", project_id: "proj-1", status: "success" }],
    async getProject(id) {
      calls.push(["getProject", id]);
      return this.project;
    },
    async getProgress(ids) {
      calls.push(["getProgress", ids]);
      return this.progress;
    },
    async submitPostprocess(endpoint, body) {
      calls.push(["submitPostprocess", endpoint, body]);
      if (this.submitError) throw this.submitError;
      return { operator_id: "op-1" };
    },
    async getStudioImageAsset(id) {
      return { asset_id: id, input: {}, output: { data: [{ bucket: "b", key: "k", url: "https://cdn.tripo3d.ai/x.png" }] }, status: "success", type: "generate_image" };
    }
  };
  const service = new OperationService({ config, gateway, session, store, uploader: null });
  return { config, gateway, service, session, store };
}

