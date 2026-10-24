# Actual RegionViewer exhaustive render audit

Local audit only. No production source/assets are edited, uploaded, deployed or pushed. Requires existing dependencies in both repositories. Uses the already installed Obsidian `esbuild`, a JavaScript bundler, and each repository's own React, Three.js and React Three Fiber dependencies.

## Start

From `/Users/fabijanpitlovic/Documents/anatomed-mcp`:

```sh
node scripts/model-audit/viewer/server.mjs --port 8766
```

The server binds only to `127.0.0.1`. Browser automation is supplied separately. Pages are `http://127.0.0.1:8766/obsidian/` and `http://127.0.0.1:8766/mcp/`.

**MCP does not currently contain `assets/glb`.** Point explicitly at the asset parent directory containing `glb/<system>.glb`. There is deliberately no silent shared-asset fallback:

```sh
node scripts/model-audit/viewer/server.mjs \
  --mcp-assets /Users/fabijanpitlovic/Documents/anatomed-obsidian/assets \
  --port 8766
```

That invocation audits the MCP viewer **against the explicitly shared Obsidian GLBs**, not presumed deployed MCP assets. Use the coordinator's verified MCP download directory instead when available. The manifest records exact asset paths, byte sizes, SHA-256 hashes, catalog hash, source hashes, and bundle hash.

Options: `--obsidian ROOT`, `--mcp ROOT`, `--obsidian-assets ASSETS`, `--mcp-assets ASSETS`, `--output DIR`, `--port PORT`, `--build-only`. Output defaults to:

```text
/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/render
```

## Browser API

Wait until `window.audit` exists. In each page:

```js
// Complete catalog + all uncatalogued exported nodes, all systems, three views.
await window.audit.run({ runId: 'full-20261024' })

// Non-blocking orchestration: retain the promise and poll status separately.
window.auditPromise = window.audit.run({ runId: 'full-20261024' })
window.audit.status()
await window.auditPromise

// System batching: use the same run ID across non-overlapping system batches.
await window.audit.run({ runId: 'full-20261024', systems: ['skeleton'] })
await window.audit.run({ runId: 'full-20261024', systems: ['muscles', 'nerves'] })

// Explicitly incomplete smoke test, never labeled exhaustive.
await window.audit.run({
  runId: 'smoke', systems: ['skeleton'],
  ids: [window.audit.catalog().parts.find(p => p.system === 'skeleton').id]
})

window.audit.stop() // finish current part, persist partial summaries, dispose
window.audit.manifest()
```

Defaults: `viewpoints: 3` (allowed 1, 2, 3), `settleFrames: 12` (minimum 10), `timeoutMs: 120000`, `includeSynthetic: true`. Do not use `ids` or `includeSynthetic:false` for complete coverage. A single page rejects concurrent runs. Separate pages can run independent systems, but avoid too many WebGL contexts and do not write the same system/run from two pages. Use a fixed browser viewport and device scale factor, ideally 1, and disable background-tab throttling in the supplied automation. Browser identity, viewport and device pixel ratio are recorded. There is no browser installation or automatic app launch.

## What actually runs

1. Each bundle imports that repository's **real `widget/RegionViewer.tsx`** and its own `assembleRegion`, `buildRegion`, and `resolveQueryToParts`.
2. The only in-memory viewer instrumentation adds an `AuditProbe` child inside the actual Canvas. It observes the live React Three Fiber state and frame count. No viewer logic is replaced. Production files stay untouched. The bundler refuses changed/ambiguous injection markers.
3. The real viewer's `SystemGroup` invokes its real `GLTFLoader` with its real meshopt decoder. A wrapper on `GLTFLoader.load` observes the resulting scene and parser without substituting them. The loader cache retains a decoded system while parts change. Readiness requires actual system meshes mounted in the Canvas, the viewer loading indicator cleared, and a changed clone for changed parts, then the settle frames. The loader callback alone is not readiness: React Suspense can mount the model later. Hidden system meshes count, so a legitimately missing requested target still reaches the normal missing-node verdict.
4. Every catalog **row** gets an isolated payload via actual `assembleRegion`, preserving the ID byte-for-byte, including `.001`, laterality and other suffixes. The viewer receives no catalog prop, preventing a second client recomputation from silently changing the exact payload. Catalog/UI interaction is not under test.
5. Independently, the normal resolver and `buildRegion` receive each exact ID. Their returned IDs, issues, unmatched terms and exact-singleton outcome are recorded separately. Successful exact-payload rendering does not imply normal resolver accessibility.
6. Exported node inventory comes from the actual loader parser's JSON node indices and `parser.associations`, not guessed glTF sanitization. Inactive scene nodes use that same parser's dependency cache. Every uncatalogued exported node is tested with **its actual loader-renamed name as the synthetic exact ID**, clearly labeled `synthetic-export`. Empty/group nodes are included and may appropriately fail geometry checks. Inactive nodes remain inactive in the actual viewer and are not artificially added to make them pass.
7. First viewpoint uses the settled actual viewer camera, unchanged. Two additional captures rotate the actual camera 90 degrees around Y and X, retaining the actual frustum. They do not replace or repair production fitting. The original camera is restored. These alternate views intentionally expose clipping possible when orbiting without refitting.
8. Pixels come directly from WebGL `readPixels`, plus PNGs from the WebGL canvas, never a screenshot of DOM controls. A temporary all-mesh-hidden render supplies a differential baseline, and visibility is restored synchronously. Contact sheets use those render-only PNGs.

## Evidence and verdicts

Each part contains exact payload and resolver outcomes, exact sanitized node match count, target descendant geometry counts, finite-coordinate and degenerate-triangle checks, visible target meshes, unexpected visible meshes, hidden target meshes, world bounds, camera state, differential pixel bounds/counts, edge occupancy, runtime errors, timings, decode count, renderer memory, and 1 to 3 PNG screenshots.

`pass-structural` requires an unambiguous exact node, finite nonempty triangle geometry, visible target geometry, no unrelated visible geometry, no unexpectedly hidden nonconnector target geometry, default-view model pixels, no edge-clipping warning, and no captured runtime errors. Entirely degenerate triangle geometry fails too. **Nonblank alone never passes.** This is structural/render evidence, not proof of anatomical correctness, correct labels, full surface visibility, clinically appropriate geometry, or absence of self-occlusion. Edge occupancy is deliberately conservative and may warrant visual review. Connector/label-only exports can fail because production intentionally hides them. Alternate-view blankness is recorded, not automatically failed, since a genuinely flat mesh can be edge-on.

Any fatal loader/render failure marks remaining affected system parts `renderAttempted:false`, still records their normal resolver coverage, and prevents complete-run claims. No repeated two-minute timeout for every remaining part. A persisted error is not a successful render. Other systems continue. A server persistence failure aborts rather than silently dropping records.

## Artifacts and reconciliation

```text
render/
  bundles/{obsidian,mcp}.js
  {obsidian,mcp}-manifest.json
  <repo>/<runId>/
    catalog-<system>-<identity hash>.json
    synthetic-export-<system>-<identity hash>.json
    <same identity>-view-{0,1,2}.png
    contact-<system>-<page>.png
    inventory-<system>.json
    summary-<system>.json
    summary-all.json
```

IDs are never truncated to derive identity. Filenames hash the complete ID plus original catalog row/exported node index, with catalog/synthetic and system namespaces. Per-part JSON and PNGs are written atomically through server endpoints before proceeding. All contact pages contain 64 labeled thumbnails. Summaries are bounded metadata, not retained full-resolution images.

For batched runs, `summary-all.json` describes the **last invocation**, not the union of earlier invocations. Reconcile disk records independently after all system batches, or after interruption:

```sh
node scripts/model-audit/viewer/summarize.mjs --repo obsidian --run full-20261024
node scripts/model-audit/viewer/summarize.mjs --repo mcp --run full-20261024
```

This writes `coverage.json`, enumerates missing exact catalog rows and synthetic nodes, missing inventories, unattempted renders, missing screenshots and separate verdict/resolver counts. Exit 2 means incomplete coverage. Coverage complete is not all-models-pass. Run a missing system again under the same run ID to replace that system's records, or use a fresh run ID for an independent audit. Do not reuse a run ID after changing assets/code.

## Memory and performance

One actual Canvas and one decoded system are reused across that system's catalog and exported-node parts. The actual viewer still performs its own full scene clone/tint for each changed partition, which is an intentional production behavior under test, not replaced with a faster helper implementation. Detached clone materials are disposed after transitions, shared source geometries are not prematurely freed, and decoded cache/geometries/materials/renderer resources are released between systems. Contact sheets are paged and PNG data is discarded after persistence. Geometry statistics are cached by geometry identity. Runtime depends on system complexity and browser rasterization, so thousands of parts can take substantial time.

## Self-checks and limits

```sh
node --test scripts/model-audit/viewer/*.test.mjs
node scripts/model-audit/viewer/server.mjs --build-only
```

Unit tests exercise evidence rules, punctuation/suffix identity and missing coverage. Integration tests actually bundle both production viewers, start the local server, and verify catalog/manifest serving, per-part PNG/JSON persistence, suffix separation, traversal rejection and cross-origin write rejection. Integration fixtures explicitly use Obsidian GLBs for both viewer manifests and are marked `fixture-only`.

**Those tests are not browser render tests.** Browser acceptance requires the supplied automation to run the API and inspect persisted evidence. An esbuild success or a helper-only unit test is never reported as an exhaustive actual-viewer render result. UI layout, actual Obsidian host integration, MCP iframe CSP, remote asset access, touch interactions and semantic anatomy validation are outside this harness.
