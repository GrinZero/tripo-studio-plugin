import React, { useEffect, useRef, useState } from "react";
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";

const h = React.createElement;
const ID = "tripo-studio-deepseek";
const ROUTE = "api/tripo-studio";

async function rpc(body, signal) {
  // Desktop owns this Fetch carrier and attaches its Host authentication.
  const send = window.__DSH_TRANSPORT__?.fetch ?? window.fetch.bind(window);
  const response = await send(ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? `Tripo HTTP ${response.status}`);
  return result;
}

export function sandboxDocument(html) {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; media-src data: blob:; font-src data:; worker-src blob:; base-uri 'none'; form-action 'none'";
  return html.replace(
    /<head([^>]*)>/i,
    (head) =>
      `${head}<meta http-equiv="Content-Security-Policy" content="${policy}"><script>window.__TRIPO_HOST__="deepseek";</script>`
  );
}

function hostContext(ctx, element) {
  return {
    locale: ctx.locale.getLocale().active,
    theme: ctx.theme.getTheme().active.colorScheme,
    platform: window.__DSH_TRANSPORT__ ? "desktop" : "web",
    userAgent: "deepseek-harness",
    displayMode: "inline",
    availableDisplayModes: ["inline", "fullscreen"],
    containerDimensions: {
      width: element.clientWidth,
      maxHeight: window.innerHeight,
    },
  };
}

// All iframe communication is bound to that exact Window; the opaque sandbox
// cannot access DSH cookies, document, filesystem, or the authenticated Fetch.
export function AppSurface({
  ctx,
  sessionId,
  callId,
  surface = "card",
  params,
  openFile,
  onInitialized,
}) {
  const root = useRef(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;
  useEffect(() => {
    const abort = new AbortController();
    let bridge,
      frame,
      token,
      heartbeat,
      observer,
      releaseLocale,
      releaseTheme,
      initTimeout;
    setError("");
    const fail = (error) => {
      if (!abort.signal.aborted) setError(error.message);
    };
    const request = (body) => rpc({ token, ...body }, abort.signal);
    const setup = async () => {
      const attached = await rpc(
        { action: "attach", sessionId, callId, surface },
        abort.signal
      );
      token = attached.token;
      const resource = await request({
        action: "readResource",
        uri: attached.uri,
      });
      const html = resource.contents.find(
        (content) => typeof content.text === "string"
      )?.text;
      if (!html) throw new Error("Tripo UI resource has no HTML.");
      abort.signal.throwIfAborted();
      frame = document.createElement("iframe");
      frame.title =
        surface === "workbench"
          ? "Tripo Studio workbench"
          : "Tripo Studio configuration and results";
      frame.setAttribute(
        "sandbox",
        "allow-scripts allow-forms allow-downloads"
      );
      frame.allowFullscreen = true;
      frame.style.cssText = `width:100%;border:0;display:block;min-height:${surface === "probe" ? 0 : 340}px;height:${surface === "workbench" ? "100%" : "480px"}`;
      root.current.append(frame);
      bridge = new AppBridge(
        null,
        { name: "DeepSeek Harness", version: "0.2.2-rc.1" },
        {
          serverTools: {},
          serverResources: {},
          openLinks: {},
          logging: {},
        },
        { hostContext: hostContext(ctx, root.current) }
      );
      bridge.oncalltool = (call) =>
        request({
          action: "callTool",
          name: call.name,
          arguments: call.arguments,
        });
      bridge.onreadresource = ({ uri }) =>
        request({ action: "readResource", uri });
      bridge.onlistresources = () => request({ action: "listResources" });
      bridge.onloggingmessage = () => {};
      bridge.onopenlink = async ({ url }) => {
        if (!/^https?:\/\//i.test(url))
          throw new Error("Only HTTP(S) links are supported.");
        window.open(url, "_blank", "noopener,noreferrer");
        return {};
      };
      bridge.onsizechange = ({ height }) => {
        if (surface === "card" && Number.isFinite(height))
          frame.style.height = `${Math.min(1600, Math.max(200, height))}px`;
      };
      bridge.onrequestdisplaymode = async ({ mode }) => {
        if (mode === "fullscreen") await frame.requestFullscreen();
        else if (document.fullscreenElement === frame)
          await document.exitFullscreen();
        return { mode };
      };
      bridge.oninitialized = async () => {
        try {
          clearTimeout(initTimeout);
          await request({ action: "ready" });
          heartbeat = setInterval(
            () => request({ action: "heartbeat" }).catch(fail),
            10000
          );
          await bridge.sendToolInput({ arguments: params ?? attached.input });
          if (attached.result) await bridge.sendToolResult(attached.result);
          onInitialized?.();
        } catch (error) {
          fail(error);
        }
      };
      const update = () =>
        bridge.setHostContext(hostContext(ctx, root.current));
      observer = new ResizeObserver(update);
      observer.observe(root.current);
      releaseLocale = ctx.on("locale/change", update);
      releaseTheme = ctx.on("theme/change", update);
      await bridge.connect(
        new PostMessageTransport(frame.contentWindow, frame.contentWindow)
      );
      initTimeout = setTimeout(
        () =>
          fail(
            new Error("Tripo UI initialization timed out. Reconnect this view.")
          ),
        15000
      );
      frame.srcdoc = sandboxDocument(html);
    };
    setup().catch(fail);
    return () => {
      abort.abort();
      clearInterval(heartbeat);
      clearTimeout(initTimeout);
      observer?.disconnect();
      releaseLocale?.();
      releaseTheme?.();
      bridge?.close().catch(() => {});
      frame?.remove();
      if (token) rpc({ action: "detach", token }).catch(() => {});
    };
  }, [ctx, sessionId, callId, surface, revision]);
  return h(
    "div",
    {
      style: {
        height: surface === "workbench" ? "100%" : undefined,
        minWidth: 0,
      },
    },
    error &&
      h(
        "div",
        { role: "alert" },
        error,
        " ",
        h(
          "button",
          { onClick: () => setRevision((value) => value + 1) },
          "Reconnect Tripo"
        )
      ),
    h("div", {
      ref: root,
      style:
        surface === "probe"
          ? { height: 0, overflow: "hidden" }
          : { height: "100%", minHeight: 340 },
    })
  );
}

export const inject = [
  "slots",
  "connection",
  "sidebarRight",
  "sidebarRightTabs",
  "locale",
  "theme",
];

export async function apply(ctx) {
  let disposed = false;
  ctx.effect(() => () => {
    disposed = true;
  });
  const open = (sessionId, params = {}) => {
    if (ctx.sidebarRight.mounted.getSnapshot() === sessionId)
      ctx.sidebarRight.openTab("tripo-studio", { params });
  };
  function SessionControl({ sessionId }) {
    return h(
      React.Fragment,
      null,
      h(
        "button",
        {
          type: "button",
          onClick: () => open(sessionId),
          title:
            "Open Tripo Studio. Closing a view does not cancel its countdown.",
        },
        "Tripo Studio"
      ),
      h(AppSurface, { ctx, sessionId, surface: "probe" })
    );
  }
  function Workbench({ sessionId, useTabInfo }) {
    const { tab } = useTabInfo();
    return h(AppSurface, {
      key: tab.navigation.revision,
      ctx,
      sessionId,
      surface: "workbench",
      params: tab.navigation.params ?? { view: "assets" },
    });
  }
  ctx.effect(() =>
    ctx.sidebarRightTabs.register({
      id: ID,
      kind: "tripo-studio",
      title: () => "Tripo Studio",
      keepMounted: true,
      guide: [
        {
          id: "workbench",
          order: 30,
          title: () => "Tripo Studio",
          description: () => "3D assets, tasks and creation",
        },
      ],
    })
  );
  ctx.slots.inject("sidebar.right.pane.tab", () =>
    ctx.slots.register({ name: "sidebar.right.pane.tab", key: ID }, Workbench)
  );
  ctx.slots.inject("conversation.session.header.actions", () =>
    ctx.slots.register(
      { name: "conversation.session.header.actions", id: ID, order: 30 },
      SessionControl
    )
  );
  const { tools } = await rpc({ action: "catalog" });
  if (disposed) return;
  for (const tool of tools) {
    const wireName = `mcp__tripo-studio__${tool.name}`;
    function ToolView({ sessionId, callId, phase, block, openFile }) {
      const settled = phase === "result";
      const isWorkbench = tool.name === "tripo_open_workbench";
      const args = (() => {
        try {
          return JSON.parse(block.call?.argsRaw ?? block.argsRaw ?? "{}");
        } catch {
          return {};
        }
      })();
      useEffect(() => {
        if (settled && isWorkbench && !block.isError) open(sessionId, args);
      }, [sessionId, callId, settled, block.isError]);
      if (!settled)
        return h(
          "div",
          { role: "status" },
          `Tripo Studio · ${tool.title ?? tool.name}…`
        );
      if (block.isError)
        return h(
          "div",
          { role: "alert" },
          (block.content ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n") || "Tripo tool failed."
        );
      if (isWorkbench)
        return h(
          "button",
          { type: "button", onClick: () => open(sessionId, args) },
          "Open Tripo Studio"
        );
      if (tool._meta?.ui?.resourceUri)
        return h(AppSurface, { ctx, sessionId, callId, openFile });
      return h(
        "details",
        null,
        h("summary", null, `Tripo Studio · ${tool.title ?? tool.name}`),
        h(
          "pre",
          { style: { whiteSpace: "pre-wrap" } },
          (block.content ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n")
        )
      );
    }
    ctx.slots.inject("tool.call.toolview", () =>
      ctx.slots.register(
        { name: "tool.call.toolview", key: wireName },
        ToolView
      )
    );
  }
}
