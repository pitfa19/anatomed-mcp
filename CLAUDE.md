# CLAUDE.md — anatomed-mcp

MCP App connector that renders an interactive, **region-only** 3D anatomy widget
inline in Claude (web + desktop). Sibling of `anatomed-web`; reuses its viewer core.

## What it is

- A remote **MCP server** (Streamable HTTP) exposing one tool, `show_anatomy_region`,
  that returns a bounded set of anatomical structures as `structuredContent`, plus a
  `ui://anatomed/region-viewer` **MCP App resource** (the single-file 3D widget HTML).
- Claude renders the widget in a sandboxed iframe. The widget loads only the needed
  GLBs from Supabase and isolates just the requested parts, with a compact **floating
  legend that toggles each structure**. **Never renders a whole system** — capped at
  `MAX_REGION_PARTS` (`src/region.ts`).
- Tool param **`detail`** = `isolated` (default) | `related` | `regional` controls how much
  surrounding context to add. `related`/`regional` append the nearest neighbour structures
  (from `parts-neighbors.json`, by 3D AABB distance — "what a nerve passes through/around"),
  rendered translucent + marked `ctx` in the legend. Grounded in `docs/anatomy-study-research.md`
  (regional approach, neurovascular bundles, cognitive-load bounding).
- Built on `@modelcontextprotocol/ext-apps` (MCP Apps, shipped 2026-01-26).

## Key facts / invariants

- **MCP Apps wiring** (verified against the spec, not the build-mcp-app skill which is stale):
  - Tool → resource link: `_meta.ui.resourceUri` (nested). Flat `_meta["ui/resourceUri"]` is deprecated; we set both.
  - Resource CSP: `_meta.ui.csp.connectDomains` on **both** the `resources/list` entry and the `resources/read` content item. Default is block-all, so the **Supabase origin must be whitelisted** there or GLB fetches fail (blank widget).
  - Resource mimeType MUST be `text/html;profile=mcp-app`.
- **Bundling**: the widget is one self-contained HTML (`vite-plugin-singlefile`) — React+R3F+three+ext-apps all inlined, zero external scripts, so the iframe CSP only needs the GLB origin.
- **Assets**: GLBs + `parts-catalog.json` live in a public Supabase bucket (`models`) in the existing anatom3d project. `assets/glb/*.glb` is gitignored; `assets/parts-catalog.json` is committed (resolution source). `ASSET_BASE_URL` unset → server serves GLBs locally (dev/tunnel fallback).
- **Reused from anatomed-web** (vendored copies, keep in sync if upstream changes): `vendor/types.ts`, `vendor/fuzzy.ts`, `vendor/resolveParts.ts` (group resolution), and `widget/lib/three-helpers.ts` (isolate/fit/tint from `isolate.ts`/`fit.ts`/`InlineAnatomy3D`). nerves/vessels keep their thin-tube guard.
- The widget mirrors `anatomed-web`'s `/agent` `InlineAnatomy3D` (clone GLB → tint → `setVisibleParts` → ortho fit → OrbitControls), **plus** the legend toggle.
- `preserveDrawingBuffer: true` on the Canvas — enables host thumbnailing + pixel-readback verification; minor perf cost, intentional.

## Commands

```bash
npm install
npm run build:widget     # → dist/index.html (single file)
npm run start            # MCP server :3000  (POST /mcp)
npx tsx scripts/smoke.ts # headless protocol check (initialize/tools/call/resources)
npm run upload:assets    # push GLBs+catalog to Supabase (needs .env service-role key)
npm run typecheck
```

Preview the widget standalone (no host): `GET /widget-preview?region=cervical spine`
or `?parts=Femur,Femoral artery` — injects `window.__ANATOMED_PREVIEW__` so it renders
without the MCP handshake (used for Playwright pixel verification).

## Status

- DONE & verified locally: scaffold, vendored libs, region resolver + tool, R3F
  widget + legend toggle, MCP wiring + CSP. Smoke test green; Playwright confirmed
  the 3D renders (cervical spine: bone-tinted, fitted) and the legend toggles
  (show/hide all + per-part), and multi-system (Femur+Femoral artery → two tints).
- VALIDATED ON REAL HOST (2026-06-01): added as a custom connector via a Cloudflare
  quick tunnel and confirmed the widget renders 3D inline in Claude — so Claude DOES
  honor `_meta.ui.csp` + forward `structuredContent`. Current hosting = laptop Node
  server + `cloudflared` quick tunnel (ephemeral, rotating URL).
- Round 2 (2026-06-01): fixed camera re-fit on resize (model vanished on resize),
  made the legend a compact floating/collapsible overlay (bottom-sheet + collapsed-by-
  default on mobile), reworked the stage layout (canvas fills, neutral backdrop, safe-area,
  clamped height), and added the `detail` verbosity levels (context via neighbours).
  All re-verified via Playwright pixel-readback (resize survives, legend ~20% overlay,
  mobile pill, `related` adds translucent context).
- NEXT: stable deploy for a lasting URL (Vercel function — adapt the Express app to a
  handler, build widget in CI, set `ASSET_BASE_URL` env; CSP stays on Supabase).
- Not yet (intentional): 3D click-to-select (legend click already messages Claude),
  labels/landmarks, fade-vs-hide as distinct states, active-recall/quiz mode (all
  flagged as future ideas in the research doc).

## Gotchas

- Server (`npm run start`) is **not** watch mode — restart after editing `src/**`. Widget changes need `npm run build:widget`.
- Catalog granularity: no single "Heart"/"Sternum" mesh (decomposed) — such queries land in `unmatched`. Whole bones / major vessels / nerves / named regions resolve well.
- Part `id` keeps its raw `.001` suffix (must match the GLB node via `sanitizeNodeName`); only the **display** name is cleaned (`cleanName` in `region.ts`).
