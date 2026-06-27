import express from 'express';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve, basename } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadCatalog } from './catalog.js';
import { buildRegion } from './region.js';

// Runtime data files resolved from the process CWD (project root locally; the
// Lambda task root on Vercel, where `includeFiles` places dist/ + assets/).
const WIDGET_HTML_PATH = resolve(process.cwd(), 'dist/index.html');
const GLB_DIR = resolve(process.cwd(), 'assets/glb');

export const PORT = Number(process.env.PORT ?? 3000);
const SERVER_NAME = 'anatomed';
const SERVER_VERSION = '0.1.0';
const UI_URI = 'ui://anatomed/region-viewer';
const MIME = 'text/html;profile=mcp-app';

// Where the widget fetches GLBs from. Defaults to the public Supabase bucket
// (the canonical asset home — works locally and on Vercel with no env setup).
// Override with ASSET_BASE_URL to serve GLBs from this server instead.
const DEFAULT_ASSET_BASE_URL =
  'https://uafyfwyyqzunabpuftue.supabase.co/storage/v1/object/public/models';
const ASSET_BASE_URL = (process.env.ASSET_BASE_URL ?? DEFAULT_ASSET_BASE_URL).replace(/\/+$/, '');

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
const ASSET_ORIGIN = originOf(ASSET_BASE_URL);

// CSP for the widget iframe. Default is block-all; we open exactly the asset
// origin so GLTFLoader's fetch() of the GLBs is allowed. (Spec: _meta.ui.csp.)
const RESOURCE_UI_META = {
  csp: {
    connectDomains: [ASSET_ORIGIN],
    resourceDomains: [ASSET_ORIGIN],
  },
  prefersBorder: true,
};

const catalog = loadCatalog();

function widgetHtml(): string {
  if (!existsSync(WIDGET_HTML_PATH)) {
    return '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">Widget not built. Run <code>npm run build:widget</code>.</body>';
  }
  return readFileSync(WIDGET_HTML_PATH, 'utf8');
}

/** Serialize a value for safe embedding inside an inline <script> element:
 *  escapes `<` and `>` so a "</script>" inside any string cannot break out
 *  of the element. JSON.parse reads it back identically. */
function htmlSafeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}

const TOOL_DESCRIPTION = [
  'Render an INTERACTIVE, rotatable 3D view of a specific anatomical REGION inline in the chat.',
  'Use this for any spatial / "show me" / "where is" / structure-relationship anatomy question.',
  'Pass one or more anatomical structures or a named region in `parts` (English, Latin, or Croatian) —',
  'e.g. ["cervical spine"], ["Femur", "Sciatic nerve"], ["hand bones"].',
  'Named regions (cervical/thoracic/lumbar spine, hand bones, foot bones, carpus, tarsus, skull bones, neurocranium, viscerocranium) expand to all their members.',
  'Set `detail` to control surrounding context:',
  '"isolated" = only the requested structures, with a lone muscle/nerve/vessel lightly anchored to its nearest bones so it is not floating (default; cleanest);',
  '"related" = also show the nearest neighbouring structures it passes through / runs near (translucent) — best for paths, routes, relations, "what does it pass", neurovascular bundles;',
  '"regional" = a wider surrounding context.',
  'The widget shows the focus structures solid + context translucent, with a legend the user can toggle per structure, plus rotate/zoom. Never the whole body.',
].join(' ');

const TOOL = {
  name: 'show_anatomy_region',
  description: TOOL_DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      parts: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Anatomical structures and/or named regions to display together. English, Latin, or Croatian names. At least one.',
      },
      title: {
        type: 'string',
        description: 'Optional short title shown above the 3D view (e.g. "Cervical spine").',
      },
      detail: {
        type: 'string',
        enum: ['isolated', 'related', 'regional'],
        description:
          'How much surrounding context to include. "isolated" (default) = only the requested structures (a lone muscle/nerve/vessel is auto-anchored to its nearest bones so it is not floating). "related" = also show nearby structures it passes through/around (translucent). "regional" = a wider context. Use "related" for path/route/relations questions.',
      },
    },
    required: ['parts'],
  },
  _meta: {
    // Nested form is the current spec; flat key kept for older hosts.
    ui: { resourceUri: UI_URI, visibility: ['model', 'app'] },
    'ui/resourceUri': UI_URI,
  },
};

function buildMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: UI_URI,
        name: 'ANATOMED 3D region viewer',
        description: 'Interactive 3D anatomy region widget.',
        mimeType: MIME,
        _meta: { ui: RESOURCE_UI_META },
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== UI_URI) {
      throw new Error(`Unknown resource: ${req.params.uri}`);
    }
    return {
      contents: [
        {
          uri: UI_URI,
          mimeType: MIME,
          text: widgetHtml(),
          _meta: { ui: RESOURCE_UI_META },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== TOOL.name) {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    const args = (req.params.arguments ?? {}) as {
      parts?: unknown;
      region?: unknown;
      title?: unknown;
      detail?: unknown;
    };
    const queries: string[] = Array.isArray(args.parts)
      ? args.parts.filter((p): p is string => typeof p === 'string')
      : typeof args.region === 'string'
        ? [args.region]
        : [];
    const title = typeof args.title === 'string' ? args.title : undefined;
    const detail =
      args.detail === 'related' || args.detail === 'regional' ? args.detail : 'isolated';

    const { payload, summary } = buildRegion(catalog, queries, ASSET_BASE_URL, { title, detail });

    return {
      content: [
        { type: 'text', text: summary },
        // Compact machine payload as a fallback for hosts that don't forward
        // structuredContent to the widget; the widget prefers structuredContent.
        { type: 'text', text: ` ANATOMED_REGION ${JSON.stringify(payload)}` },
      ],
      structuredContent: payload,
      _meta: { ui: { resourceUri: UI_URI }, 'ui/resourceUri': UI_URI },
    };
  });

  return server;
}

/** Build the Express app (all routes). Used both by the local server
 *  (`src/server.ts`) and the Vercel serverless handler (`api/index.ts`). */
export function createApp(): express.Express {
  const app = express();

  // Parse JSON bodies — but skip if the platform (e.g. Vercel) already parsed
  // the body, otherwise re-reading the consumed stream would blank out req.body.
  const jsonParser = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') return next();
    jsonParser(req, res, next);
  });

  // CORS so the widget iframe (sandboxed, opaque origin) and tooling can reach us.
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, mcp-session-id, mcp-protocol-version',
    );
    next();
  });
  app.options('/mcp', (_req, res) => res.sendStatus(204));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, assetBase: ASSET_BASE_URL, parts: catalog.parts.length });
  });

  // Serve GLBs locally (only used when ASSET_BASE_URL points back here).
  app.get('/assets/glb/:file', (req, res) => {
    const file = basename(req.params.file);
    const path = resolve(GLB_DIR, file);
    if (!path.startsWith(GLB_DIR) || !existsSync(path)) {
      res.sendStatus(404);
      return;
    }
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(path).pipe(res);
  });

  // Browser preview of the widget without a host: inject a sample region payload.
  app.get('/widget-preview', (req, res) => {
    const theme = req.query.theme === 'dark' ? 'dark' : 'light';
    const queries = req.query.parts
      ? String(req.query.parts)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [String(req.query.region ?? 'cervical spine')];
    const d = String(req.query.detail ?? 'isolated');
    const detail = d === 'related' || d === 'regional' ? d : 'isolated';
    const { payload } = buildRegion(catalog, queries, ASSET_BASE_URL, { detail });
    const inject = `<script>window.__ANATOMED_PREVIEW__=${htmlSafeJson({ payload, theme })};</script>`;
    res.type('html').send(widgetHtml().replace('</head>', `${inject}</head>`));
  });

  app.post('/mcp', async (req, res) => {
    try {
      const server = buildMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request error:', err);
      // Don't leak internal error detail to the client; it's logged above.
      if (!res.headersSent) res.status(500).json({ error: 'internal server error' });
    }
  });

  app.get('/', (_req, res) => {
    res
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;max-width:40rem;margin:3rem auto;line-height:1.5">
      <h1>ANATOMED MCP</h1>
      <p>Interactive 3D anatomy region connector for Claude.</p>
      <ul>
        <li>MCP endpoint: <code>POST /mcp</code></li>
        <li>Widget preview: <a href="/widget-preview?region=cervical%20spine">/widget-preview?region=cervical spine</a></li>
        <li>Health: <a href="/healthz">/healthz</a></li>
      </ul>
      <p>Asset base: <code>${ASSET_BASE_URL}</code></p>
      </body>`,
      );
  });

  return app;
}
