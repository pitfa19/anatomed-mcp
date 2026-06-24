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
- Round 4 (2026-06-23): **mobile fixes.** (1) **Legend now touch-scrolls** — it was
  rendered inside `.am-stage`, and R3F sets `touch-action:none` on its full-bleed
  `.am-canvas` wrapper, so Chromium suppressed touch-scroll for the whole stage subtree.
  Fix: a new `.am-viewport` wraps the stage + legend, and the `<Legend>` now renders as a
  **sibling of `.am-stage`** (escapes the suppressed subtree), plus `transform:translateZ(0)`
  on `.am-legend` to give it its own compositing layer over the WebGL canvas. (2) **Steadier
  3D drag** — `TouchGuard` counts active touch pointers (capture phase) and holds
  `enableRotate=false` once a gesture has ≥2 fingers until ALL lift, so lifting one finger
  out of a pinch can't spin the model and a stray 2nd touch can't flip rotate→zoom; the
  hover-to-name raycast + tooltip + per-move `setPointerPos` are now **gated to fine-pointer
  devices** (killed the per-pointermove re-render storm that churned OrbitControls during a
  drag); `mouseButtons`/`touches` hoisted to stable module consts. Mapping unchanged
  (1 finger rotate / 2 finger pinch-zoom+pan — user confirmed). Verified via the CDP-touch
  harness: legend body scrolls (195px) once promoted, 1-finger drag rotates. NOTE: the
  headless SwiftShader compositor can't scroll a *bottom-anchored* layer over the canvas
  (non-spec quirk), so the mobile bottom-sheet scroll itself needs a real-device check.
- Round 5 (2026-06-24): **real-device (iPhone/Claude app) round.** User reported Round 4 still
  broken on a physical iPhone: drag scrolled the chat, legend didn't scroll, bottom sheet
  unwanted. Root cause of the drag bug: **iOS/WKWebView ignores `touch-action:none` inside a
  sandboxed iframe**, so finger-drags fell through to the chat scroll (R3F's touch listeners
  are all *passive* → can't `preventDefault`). Fix: `<CanvasGestureLock>` adds a **non-passive
  `touchmove` preventDefault** on the canvas (OrbitControls still gets pointer events, so
  rotate/zoom work; the chat stops scrolling); plus `overscroll-behavior:none` on root/canvas.
  Legend redesigned from a bottom sheet → **compact top-right pill that expands into a bounded,
  scrollable corner panel** (model stays visible). Pill width fix: a collapsed legend's hidden
  `nowrap` body stretched it full-width, so `.am-collapsed .am-legend-collapse{width:0}` sizes
  the pill to its header. Legend body is now a `flex:1`+`min-height:0` scroll region with
  `-webkit-overflow-scrolling:touch`. Headless-verified: top-anchored legend scrolls (237px),
  1-finger drag rotates, compact pill + corner panel render right. The **iframe chat-scroll fix
  is NOT reproducible headlessly** (iOS-iframe-specific) → confirmed by user on device.
- Round 6 (2026-06-24): **legend scroll on iPhone.** Movement was fixed in Round 5, but the
  legend list still wouldn't scroll on the real iPhone (scrolled in Chromium) — a WebKit bug:
  **`backdrop-filter` on an ancestor breaks touch-scrolling of descendants on iOS Safari.** Fix:
  move the panel background + blur off `.am-legend` onto a `.am-legend::before` layer (z-index:-1)
  BEHIND the content, so the scroll list is no longer a descendant of a `backdrop-filter` element
  (glass look preserved). Also `flex:1 1 auto` on `.am-legend-collapse` so the grid track is
  definite and the body gets a real bounded height on iOS. Headless still scrolls (237px); iOS fix
  needs on-device confirmation.
- Round 7 (2026-06-24): Round 6 STILL didn't scroll on the iPhone. Two changes: (1) **explicit
  measured pixel `max-height` on the legend body** via a ResizeObserver effect (unconstrain body →
  read the legend's CSS-clamped height → set `body.maxHeight = legend.clientHeight - head - actions`;
  observe the VIEWPORT not the legend to avoid a shrink feedback loop; re-measure 300ms post-anim).
  A definite px height is the most reliable iOS overflow-scroll trigger (flex/grid heights are
  flaky there). Headless: body=288px, scrollable, swipe→245px. (2) a **temporary on-device
  diagnostic** — triple-tap the legend header → overlay shows `body ch/sh/scrollable`, the
  touch-action/backdrop-filter/transform/overflow of every ancestor, the UA, and a live touch
  counter, so the iPhone can report WHY the list won't scroll. REMOVE the diagnostic once confirmed.
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
- **HTML overlays over the 3D canvas can't touch-scroll if they live inside `.am-stage`.** R3F sets
  `touch-action:none` on the full-bleed `.am-canvas` wrapper; Chromium then disables touch-scrolling for
  every element in that stage subtree (a `<div overflow-y:auto touch-action:pan-y>` scrolls as a child of
  `.am-root` but NOT as a child of `.am-stage`). Any future scrollable overlay must render OUTSIDE
  `.am-stage` (e.g. in `.am-viewport`) and be promoted to its own layer (`transform:translateZ(0)`).
- **iOS/WKWebView (Claude app) ignores `touch-action:none` in a sandboxed iframe.** Finger-drag on
  the canvas scrolls the host chat instead of rotating. The fix is `<CanvasGestureLock>`: a
  **non-passive** `touchmove` listener on the canvas that calls `preventDefault()` (R3F's own touch
  listeners are passive, so they can't). This canNOT be reproduced headlessly or in a standalone
  preview tab — it only manifests inside the app's iframe, so it needs a real-device check.
- **iOS Safari breaks touch-scroll of any element nested under a `backdrop-filter` ancestor.** A
  list with `overflow-y:auto` scrolls in Chromium but not on iPhone if an ancestor has
  `backdrop-filter`. Put the blur on a `::before`/`::after` layer behind the content instead, so the
  scroll container isn't a descendant of the filtered element. (Same class of "Chromium-only" trap.)
- **A collapsed floating panel sized `width:auto` still stretches full-width** if its hidden body has
  `nowrap` content (that content drives intrinsic width even at `height:0`). Zero the hidden wrapper's
  width (`.am-collapsed .am-legend-collapse{width:0}`) so the pill sizes to just its header.
