# Tripo sidebar icon

Source: https://www.tripo3d.ai/images/logo/tripo-logo1.webp
Retrieved: 2026-10-08 from the official website header.

The original 60×60 transparent WebP mark is preserved as tripo-official-mark.webp. ui/tripo-logo.png is a lossless format conversion. The plugin manifest and MCP server/tool icons use the PNG directly. ui/icon.svg is a preview wrapper with 2 px padding, not the registered icon. The source is raster, not a recreated vector. The preview is illustrative; native host rendering has not been verified.

## Workbench header icons

2026-10-09: The workbench header uses the vector mark from the live Studio header at https://studio.tripo3d.ai (`i-tripo:tripo` background SVG). Its yellow fill is preserved; the neutral fill follows the page text color for dark/light visibility. It replaces the generic orange layers symbol.

Refresh and appearance use Lucide `refresh-cw` and `sun` geometry, with the workbench's existing stroke styling:

- https://github.com/lucide-icons/lucide/blob/main/icons/refresh-cw.svg
- https://github.com/lucide-icons/lucide/blob/main/icons/sun.svg

ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

2026-10-09: MCP SDK 1.32.1 drops icons passed to registerTool, so the tools/list handler adds the official workbench icon to the serialized response. The stdio handshake regression checks the actual image bytes and both server and tool icon metadata. The installed plugin was refreshed through codex plugin add.
