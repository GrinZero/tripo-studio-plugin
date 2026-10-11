import { fileURLToPath } from 'node:url';

export const browserPreviewOptions = {
  alias: { 'three/examples/jsm/libs/meshopt_decoder.module.js': fileURLToPath(new URL('../ui/meshopt-server-only.mjs', import.meta.url)) }
};
