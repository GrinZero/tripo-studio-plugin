import { mkdir } from "node:fs/promises";
import { AuthCoordinator } from "./auth/coordinator.mjs";
import { SessionManager } from "./auth/session.mjs";
import { loadConfig } from "./config.mjs";
import { OperationService } from "./ops/service.mjs";
import { StudioGateway } from "./studio/gateway.mjs";
import { StudioHttpClient } from "./studio/http-client.mjs";
import { AwsObjectUploader } from "./studio/uploader.mjs";
import { TaskStore } from "./store/tasks.mjs";
import { PricingService } from "./studio/pricing.mjs";

// Every stdio MCP process builds this full stack: shared file state under
// dataDir makes multiple processes equivalent — no resident backend.
export async function createRuntime(env = process.env) {
  const config = loadConfig(env);
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  await mkdir(config.assetRoot, { recursive: true });
  const session = new SessionManager(config);
  const http = new StudioHttpClient(config, session);
  const gateway = new StudioGateway(http);
  const auth = new AuthCoordinator(config, session);
  http.setAuthRecovery(auth);
  const uploader = new AwsObjectUploader();
  const store = new TaskStore(config.dataDir);
  const pricing = new PricingService(gateway);
  const service = new OperationService({ config, gateway, session, store, uploader, pricing });
  const recovered = await service.recover();
  return { auth, config, gateway, http, recovered, service, session, store, uploader, pricing };
}
