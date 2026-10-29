import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionManager } from "../src/auth/session.mjs";
import { StudioHttpClient } from "../src/studio/http-client.mjs";
import { TripoError } from "../src/errors.mjs";
import { createAuthRecovery } from "../ui/auth-recovery.mjs";

const rejection = (code) => ({
  isError: true,
  structuredContent: { error: { code } },
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

it("coalesces expired requests, allows manual retry, and re-arms after verified recovery", async () => {
  let logins = 0;
  let notices = 0;
  let finish;
  const recovery = createAuthRecovery({
    expired: () => notices++,
    login: () => {
      logins++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    failed: () => assert.fail("unexpected login failure"),
  });
  recovery.observe("tripo_get_payment", rejection("HTTP_ERROR"));
  recovery.observe("tripo_auth_login", rejection("AUTH_REQUIRED"));
  await tick();
  assert.equal(logins, 0);
  recovery.observe("tripo_get_payment", rejection("AUTH_EXPIRED"));
  recovery.observe("tripo_ui_asset_library", rejection("AUTH_REQUIRED"));
  await tick();
  assert.equal(logins, 1);
  assert.equal(notices, 2);
  finish();
  await tick();
  recovery.observe("tripo_list_tasks", {});
  recovery.observe("tripo_get_payment", rejection("AUTH_EXPIRED"));
  await tick();
  assert.equal(logins, 1);
  const manual = recovery.login();
  await tick();
  assert.equal(logins, 2);
  recovery.observe("tripo_get_payment", {});
  finish();
  await manual;
  recovery.observe("tripo_get_payment", rejection("AUTH_EXPIRED"));
  await tick();
  assert.equal(logins, 3);
  finish();
  await tick();
});

it("leaves failed automatic login retryable by the login button without a loop", async () => {
  let failures = 0;
  const recovery = createAuthRecovery({
    expired() {},
    login: async () => {
      throw new Error("login cancelled");
    },
    failed: () => failures++,
  });
  recovery.observe("tripo_get_payment", rejection("AUTH_REQUIRED"));
  await tick();
  recovery.observe("tripo_get_payment", rejection("AUTH_REQUIRED"));
  await tick();
  assert.equal(failures, 1);
  await recovery.login();
  assert.equal(failures, 2);
});

for (const status of [401, 403]) {
  it(`invalidates locally valid credentials on HTTP ${status} before recovery`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-auth-test-"));
    try {
      const config = {
        dataDir: dir,
        deviceId: "test",
        apiBaseUrl: "https://example.invalid",
        studioOrigin: "https://example.invalid",
        requestTimeoutMs: 1000,
      };
      const session = new SessionManager(config);
      await session.set({ cookie: "old-session" });
      let requests = 0;
      const client = new StudioHttpClient(config, session, {
        fetch: async () => {
          requests++;
          return new Response("", { status });
        },
        authRecovery: {
          async recover() {
            assert.equal((await session.status()).authenticated, false);
            throw new TripoError("AUTH_REQUIRED", "Sign in", {
              nextAction: "tripo_auth_login",
            });
          },
        },
      });
      await assert.rejects(
        client.request(
          { method: "GET", path: "/v2/test", retrySafe: true },
          (v) => v
        ),
        (error) =>
          error.code === "AUTH_EXPIRED" &&
          error.nextAction === "tripo_auth_login"
      );
      assert.equal(requests, 1);
      assert.equal(
        (await new SessionManager(config).status()).authenticated,
        false
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

it("refreshes once and retries with the replacement cookie", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tripo-auth-test-"));
  try {
    const config = {
      dataDir: dir,
      deviceId: "test",
      apiBaseUrl: "https://example.invalid",
      studioOrigin: "https://example.invalid",
      requestTimeoutMs: 1000,
    };
    const session = new SessionManager(config);
    await session.set({ cookie: "old" });
    let requests = 0;
    const client = new StudioHttpClient(config, session, {
      fetch: async (_url, options) => {
        requests++;
        if (requests === 1) return new Response("", { status: 401 });
        assert.equal(options.headers.cookie, "ory_kratos_session=new");
        return Response.json({ code: 0, data: { recovered: true } });
      },
      authRecovery: { recover: () => session.set({ cookie: "new" }) },
    });
    assert.deepEqual(
      await client.request({ method: "GET", path: "/v2/test" }, (v) => v),
      { recovered: true }
    );
    assert.equal(requests, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("a late auth rejection cannot clear a newly installed credential", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tripo-auth-test-"));
  try {
    const config = {
      dataDir: dir,
      deviceId: "test",
      apiBaseUrl: "https://example.invalid",
      studioOrigin: "https://example.invalid",
      requestTimeoutMs: 1000,
    };
    const session = new SessionManager(config);
    await session.set({ cookie: "old" });
    const client = new StudioHttpClient(config, session, {
      fetch: async () => {
        await session.set({ cookie: "new" });
        return new Response("", { status: 401 });
      },
    });
    await assert.rejects(
      client.request({ method: "GET", path: "/v2/test" }, (v) => v),
      { code: "AUTH_EXPIRED" }
    );
    assert.equal(
      (await session.getRequestIdentity()).cookie,
      "ory_kratos_session=new"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("transport failures do not invalidate credentials or trigger auth recovery", async () => {
  const client = new StudioHttpClient(
    { apiBaseUrl: "https://example.invalid", requestTimeoutMs: 1000 },
    {
      getRequestIdentity: async () => ({ cookie: "ory_kratos_session=valid" }),
      clear: () => assert.fail("unexpected invalidation"),
    },
    {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      authRecovery: { recover: () => assert.fail("unexpected auth recovery") },
    }
  );
  await assert.rejects(
    client.request({ method: "GET", path: "/v2/test" }, (v) => v),
    { code: "HTTP_ERROR" }
  );
});
