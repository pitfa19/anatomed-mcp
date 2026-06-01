import { Component, StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import { REGION_SCHEMA, type RegionPart, type RegionPayload } from '../src/shared';
import RegionViewer from './RegionViewer';
import './styles.css';

type Theme = 'light' | 'dark';

interface PreviewGlobal {
  payload: RegionPayload;
  theme?: Theme;
}
declare global {
  interface Window {
    __ANATOMED_PREVIEW__?: PreviewGlobal;
  }
}

/** Extract the region payload from a tool result (structuredContent first,
 *  then a marked text block as fallback). */
function parsePayload(res: unknown): RegionPayload | null {
  const r = res as { structuredContent?: RegionPayload; content?: unknown[] } | undefined;
  if (r?.structuredContent && r.structuredContent.schema === REGION_SCHEMA) {
    return r.structuredContent;
  }
  const blocks = Array.isArray(r?.content) ? r!.content : [];
  for (const b of blocks) {
    const block = b as { type?: string; text?: string };
    if (block?.type === 'text' && typeof block.text === 'string') {
      const marker = 'ANATOMED_REGION ';
      const i = block.text.indexOf(marker);
      if (i >= 0) {
        try {
          return JSON.parse(block.text.slice(i + marker.length)) as RegionPayload;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null;
}

function Root() {
  const preview = typeof window !== 'undefined' ? window.__ANATOMED_PREVIEW__ : undefined;
  const [payload, setPayload] = useState<RegionPayload | null>(preview?.payload ?? null);
  const [theme, setTheme] = useState<Theme>(preview?.theme ?? 'light');
  const appRef = useRef<App | null>(null);

  useEffect(() => {
    if (preview) return; // standalone preview: no host handshake
    let disposed = false;
    const app = new App({ name: 'anatomed-region-viewer', version: '0.1.0' }, {});
    appRef.current = app;

    app.ontoolresult = (params) => {
      const p = parsePayload(params);
      if (p && !disposed) setPayload(p);
    };
    app.onhostcontextchanged = (ctx) => {
      if (ctx.theme && !disposed) setTheme(ctx.theme);
    };

    app
      .connect(new PostMessageTransport(window.parent))
      .then(() => {
        const ctx = app.getHostContext();
        if (ctx?.theme && !disposed) setTheme(ctx.theme);
      })
      .catch((err) => console.error('[anatomed] host connect failed:', err));

    return () => {
      disposed = true;
    };
  }, [preview]);

  const onSelect = (part: RegionPart) => {
    const app = appRef.current;
    if (!app) return;
    const lat = part.name_lat && part.name_lat !== part.name_en ? ` (${part.name_lat})` : '';
    app
      .sendMessage({
        role: 'user',
        content: [{ type: 'text', text: `Tell me about the ${part.name_en}${lat}.` }],
      })
      .catch((err) => console.error('[anatomed] sendMessage failed:', err));
  };

  return (
    <div className={`am-root${theme === 'dark' ? ' am-dark' : ''}`}>
      {payload ? (
        <>
          <div className="am-header">
            <span className="am-title">{payload.title}</span>
            <span className="am-sub">{payload.parts.length} structure(s)</span>
          </div>
          <ErrorBoundary>
            <RegionViewer payload={payload} onSelect={onSelect} />
          </ErrorBoundary>
          {payload.unmatched.length > 0 && (
            <div className="am-unmatched">Not found: {payload.unmatched.join(', ')}</div>
          )}
        </>
      ) : (
        <div className="am-loading am-center">Waiting for anatomy data…</div>
      )}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="am-center am-error">
          Could not render the 3D model.
          <div className="am-error-detail">{this.state.error}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
