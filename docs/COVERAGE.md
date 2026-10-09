# Coverage — 0.2.0 (2026-10-08)

Implementation, contract verification and real execution are separate below. Newly added paid operations were not billed in this update.

| Area | Implementation / verification |
|---|---|
| Browser-member account, headless session | Existing session reuse preserved; real read API calls succeeded |
| Shared registry | 28 operations; real stdio MCP handshake exposes 53 tools |
| Generation delight / PBR / geometry | Independent parameters; contract tests inspect frozen payloads, reject unsupported combinations |
| Smart Mesh P2 | Production version, quad topology, 25K budgets, 1/2/4 variations; P1 restrictions retained; no paid live generation |
| 30-image independent batch | Batch endpoint, frozen inputs, per-result operator/project association and 120 output slots; 20-ID progress chunks tested; no paid batch |
| Smart UV | Read context live verified; real GLB triangle-count gate; separate candidate creation/download/application, stale-plan guards; no paid UV run |
| Rig V3 / skeleton presets | Production model version and `spec` values; precheck; humanoid vs other; tests verify Mixamo wire data; no paid rebinding |
| AI motion / multistage | Generate/task/asset/list endpoints, segment/waypoint validation, exact asset retarget matching; real empty catalog read; mock lifecycle tested; no paid motion |
| Configurable owned export | 0.2.1: live MCP ZIP FBX downloads at 1K/2K/4K produce matching actual textures, verified by Blender re-import with 65-bone rig; FBX bytes unchanged, credits unchanged. tripo_download verifies/downsamples actual files and records dimensions/hashes. See EXPORT_RESOLUTION_FIX_2026-10-08.md |
| Image 2.5 / direct existing-output editing | Production enum and direct audited Studio references; retained source IDs/output slots; tests avoid reupload; no paid new editing |
| Image upscale / subject split | Production endpoint/selected resource key; output types supported; no paid live transformation |
| Manual mesh edits | Real Blender merge, face split, hide/export visibility and delete; original unchanged; self-contained GLB only; skinned structural edits rejected |
| Local viewport / paint / crop / projection | Actual 2x render, camera round trip, real brush/crop and base-color UV bake; front modified, occluded back preserved; visually inspected retained PNGs |
| UV utilization | Local inspection estimates per-part union in tile [0,1] at 256x256; fixture verifies full tile. Does not reproduce Studio's exact metric |
| Durable tasks / recovery / download | Existing recovery and unknown-write protection retained; local interruption separated; URL privacy, snapshot checks, file copy/path containment tested |
| Workbench | Actual browser clicks + temporary loopback bridge to real MCP: prepare/execute/sync/save succeeded without login or upload; free/paid labels and structured tool-error handling corrected |
| Distribution | Source and dist built; installed local marketplace updated to 0.2.0. Current conversation must reload its MCP connection to acquire new schemas |

## Verified commands

- `npm run build`
- `npm test` — 39 passed, 0 skipped on this machine, including installed Blender 5.1.2 execution and bundled MCP handshake.
- `codex plugin add tripo-studio-plugin@tripo-studio-local --json`

## Boundaries

- Paid capabilities beyond the pre-existing image-generation check remain production-contract + local/mock verification, not paid end-to-end verification.
- Local projection is a face-center visibility approximation and base-color bake. It is not the Studio viewport renderer, interactive paint UI, or complete PBR shader reproduction.
- Editing history records this plugin's source lineage and Studio asset inputs. It does not promise a complete server-side revision graph for edits made outside this plugin.
- Native Codex MCP-UI host binding was not independently exercised; the browser verification used the real MCP server through a temporary bridge. The production stdio handshake was verified separately.
- Video-to-motion remains disabled on the audited page; real-time mesh editor is advertised as coming soon. No fictitious endpoints were added. DCC Bridge, team/share management and public paid export were outside this audit.

See [release evidence](CAPABILITY_UPDATE_2026-10-08.md) for exact sources, artifacts and live export IDs. Earlier 0.1.0 live checks are retained in CORE.md as historical evidence.
