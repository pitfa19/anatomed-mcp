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
- Round 3 (2026-06-22): added **hover-to-name** (raycast on pointer move → follow-cursor
  tooltip with the structure's name; maps the hit mesh back to its part via
  `sanitizeNodeName` ancestor walk, visible-only), a **clean legend open/close animation**
  (grid-rows `1fr↔0fr` + opacity; body kept mounted with its own scroll cap), and
  **right-click pan** (OrbitControls `enablePan` + LEFT=rotate/RIGHT=pan/two-finger=pan)
  with a **pan clamp** (`PanClamp` keeps the orbit target inside the model's AABB every
  frame, so the model can never be dragged off-screen) plus a **Recenter button**
  (bumps a nonce that re-keys `Fit` → re-frames). Verified with real input over a CDP
  debug-*pipe* (the sandbox kills debug-*port* chromium; pipe avoids the listening socket).
- DEPLOYED (2026-06-22): live on **Vercel** at `https://anatomed-mcp.vercel.app`
  (MCP endpoint `POST /mcp`). The Express app is served as one serverless function
  (`api/index.ts` → `createApp()` from `src/app.ts`); `src/server.ts` stays the local
  listener. `vercel.json` builds the widget, serves a static landing page from
  `public/`, catch-all-rewrites every path to the function, and `includeFiles` bundles
  `dist/index.html` + `assets/*.json` into the Lambda. `ASSET_BASE_URL` defaults to the
  public Supabase bucket (no env setup). Redeploy: `npx vercel deploy --prod`
  (project `anatomed-mcp`, team "pitfa19's projects"). Verified on prod: healthz,
  widget-preview, full MCP handshake, and `related` context (neighbours).
- Not yet (intentional): 3D click-to-select (legend click already messages Claude;
  hover now shows the name), persistent labels/landmarks, fade-vs-hide as distinct
  states, active-recall/quiz mode (all flagged as future ideas in the research doc).

## TODO (later — agreed with user, not yet done)

- [x] **Move-around / pan interaction.** DONE (Round 3): left-drag = rotate, right-drag = pan,
  wheel = zoom, one-finger = rotate / two-finger = pinch-zoom + pan (`mouseButtons`/`touches` on
  OrbitControls). A `PanClamp` component bounds the orbit target to the model AABB so it can't be
  dragged off-screen, and a Recenter button re-frames via `Fit`.
- [x] **More mobile polish.** DONE: finger-sized legend rows + buttons, `touch-action:none` on the
  canvas so 3D gestures don't scroll the chat (legend keeps `pan-y`), safe-area insets, bottom-sheet
  grab-handle, 40px Recenter. Still TODO: verify safe-area + real touch gestures on a physical device.
- [ ] (from research, `docs/anatomy-study-research.md`) a "bundle" default detail level + an active-recall / quiz mode (hide names, "what does this supply?") — both need a functional-relationship dataset beyond the current spatial `parts-neighbors.json`.

## Gotchas

- Server (`npm run start`) is **not** watch mode — restart after editing `src/**`. Widget changes need `npm run build:widget`.
- Catalog granularity: no single "Heart"/"Sternum" mesh (decomposed) — such queries land in `unmatched`. Whole bones / major vessels / nerves / named regions resolve well.
- Part `id` keeps its raw `.001` suffix (must match the GLB node via `sanitizeNodeName`); only the **display** name is cleaned (`cleanName` in `region.ts`).
- **Vercel/ESM**: relative runtime imports in the server graph (`src/**`, `api/**`) MUST carry `.js`
  extensions — Vercel's Node runtime transpiles per-file (no bundling), so Node's native ESM resolver
  needs them. Extensionless imports work locally (tsx/vite) but crash on Vercel with `ERR_MODULE_NOT_FOUND`.
