# anatomed-mcp

An **MCP App connector** that renders an interactive, region-isolated 3D anatomy
viewer **inline inside Claude** (web + desktop). Ask Claude to show an anatomical
region and a live, rotatable 3D widget appears in the chat — showing only the
requested structures, with a **legend that toggles each one** on/off.

Built on the [MCP Apps extension](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
(`@modelcontextprotocol/ext-apps`). The 3D pipeline reuses anatomed-web's viewer
core (catalog, group resolution, isolation, tinting).

## How it works

```
Claude ──tools/call show_anatomy_region──▶ MCP server (this)
        ◀─ structuredContent (region) ───┘ resolves a bounded set of parts
Claude ──resources/read ui://… ─────────▶ serves the single-file widget HTML
  └─ renders widget in a sandboxed iframe; widget fetches only the needed
     GLBs from Supabase (whitelisted via _meta.ui.csp.connectDomains),
     isolates the region, draws a legend with per-structure toggles.
```

The widget never shows a whole body system — always a bounded **region**
(`MAX_REGION_PARTS`), matching the "regions + legend toggle" product rule.

## Develop

```bash
npm install
npm run build:widget            # build the single-file widget → dist/index.html
npm run start                   # MCP server on :3000  (POST /mcp)
# open http://localhost:3000/widget-preview?region=cervical%20spine  to preview the widget
# open http://localhost:3000/widget-preview?parts=Femur,Femoral%20artery
npx tsx scripts/smoke.ts        # headless MCP protocol check
```

`ASSET_BASE_URL` unset → GLBs served locally off `/assets` (dev). Set it to the
Supabase public origin for production (stable origin = stable CSP).

## Host the GLB assets (one-time / on model change)

```bash
cp .env.example .env            # fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run upload:assets           # uploads assets/glb/*.glb + parts-catalog.json
# set the printed ASSET_BASE_URL in .env
```

## Connect to Claude (test)

1. Expose the server publicly (Anthropic connects from its cloud, not your LAN):
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
2. In Claude → **Customize → Connectors → Add custom connector**, paste
   `https://<tunnel-host>/mcp`.
3. Enable it in a chat (the **+** menu) and ask, e.g. *"show me the cervical spine in 3D"*.

For a stable URL, deploy the server to a host (e.g. Vercel) instead of a tunnel.

## Layout

| Path | What |
|------|------|
| `src/server.ts` | MCP server: `show_anatomy_region` tool + `ui://` resource (CSP) |
| `src/region.ts` | Resolve queries → bounded region payload |
| `src/catalog.ts` | Load the committed parts catalog |
| `src/vendor/` | Vendored from anatomed-web (types, fuzzy, resolveParts) |
| `widget/` | Single-file R3F widget (RegionViewer + legend) |
| `widget/lib/three-helpers.ts` | Vendored isolate/fit/tint (three.js) |
| `scripts/upload-assets.ts` | Push GLBs + catalog to Supabase Storage |
| `scripts/smoke.ts` | Headless MCP protocol test |
| `assets/parts-catalog.json` | Committed catalog (resolution source) |
| `assets/glb/*.glb` | Gitignored; sourced from anatomed-web, hosted on Supabase |
