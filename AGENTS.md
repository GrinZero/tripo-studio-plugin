# Plugin updates

For every update to this plugin, including features, fixes, UI, skills, and documentation, run `npm run build` to refresh the workbench version marker and include the generated distribution files with the change. The marker must use `v<package.json version>-YYYYMMDDHHmmss` with a build timestamp in `Asia/Taipei`; do not generate a timestamp when the page opens. Run `npm run check:distribution` after building to verify the marker matches the packaged workbench. Keep the base version synchronized through the existing `npm version` lifecycle when releasing a new npm version.
