// Studio Meshopt is decoded by src/ui/media.mjs before reaching the app.
// model-viewer eagerly imports its optional WASM decoder; replace that unused
// browser module so the host's script policy needs no WebAssembly permission.
export const MeshoptDecoder = { supported: false, ready: Promise.resolve() };
