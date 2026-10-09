# Download result cards

Successful `tripo_download` results contain `{ download, source }`. The result
card previously handled top-level tasks, projects and assets only, so downloads
produced zero cards and the text summary fell back to raw JSON.

Downloads now display the saved filename, format, size, output path and separate
Blender-compatible path. Compatibility errors remain visible without changing a
successful source download into a failure. GLB and raster images preview the
exact saved file; other export formats retain a file information card.

The app-only `tripo_ui_preview` accepts `local_path`, confined by canonical path
checking to configured output roots, with the existing size and GLB resource
limits. It reads the saved artifact without requesting the project's current
model or accidentally selecting a different image output.

Verification: card regression tests, local media containment and symlink tests,
and a public MCP download-to-preview round trip. The reported 14,065,008-byte
GLB produced a 14,257,708-byte decoded preview and rendered in the actual card
through an MCP App bridge. Screenshot: `output/playwright/download-fixed.png`.

Rebuild with `npm run build`. Reload the installed plugin connection and open a
new result card to load the updated backend and UI.
