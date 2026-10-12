// Read through MCP rather than reloading the host's cached iframe URL.
export async function latestWorkbenchHtml(app) {
  const { resources } = await app.listServerResources({});
  const resource = resources.find(
    (item) =>
      item.name === "workbench" && item.uri.startsWith("ui://tripo-studio/")
  );
  if (!resource) throw Error("Workbench resource is unavailable.");
  const result = await app.readServerResource({ uri: resource.uri });
  const html = result.contents.find(
    (item) =>
      item.uri === resource.uri && item.mimeType?.startsWith("text/html")
  )?.text;
  if (!html?.includes('id="appVersion"') || !html.includes("<script>"))
    throw Error("Workbench resource is incomplete.");
  return html;
}

export function reloadDocument(html, snapshot) {
  const state = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  const document = html.replace(
    /<head>/i,
    () => `<head><script>window.__TRIPO_RELOAD_STATE__=${state};</script>`
  );
  const url = URL.createObjectURL(new Blob([document], { type: "text/html" }));
  try {
    window.location.replace(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
