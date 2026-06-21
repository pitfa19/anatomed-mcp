import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, useGLTF } from '@react-three/drei';
import type { RegionPart, RegionPayload, RegionSystemMeta } from '../src/shared';
import {
  applyTint,
  computeVisibleUnionBox,
  fitOrthoToBox,
  sanitizeNodeName,
  setVisibleParts,
} from './lib/three-helpers';

interface Props {
  payload: RegionPayload;
  /** Called when the user clicks a structure name (asks Claude about it). */
  onSelect?: (part: RegionPart) => void;
}

export default function RegionViewer({ payload, onSelect }: Props) {
  const systemsById = useMemo(() => {
    const m = new Map<string, RegionSystemMeta>();
    for (const s of payload.systems) m.set(s.id, s);
    return m;
  }, [payload.systems]);

  // Parts grouped by system, in payload order.
  const groups = useMemo(() => {
    const bySys = new Map<string, RegionPart[]>();
    for (const p of payload.parts) {
      const arr = bySys.get(p.system) ?? [];
      arr.push(p);
      bySys.set(p.system, arr);
    }
    return [...bySys.entries()].map(([sysId, parts]) => ({
      system: systemsById.get(sysId)!,
      parts,
    }));
  }, [payload.parts, systemsById]);

  // Visibility: focus parts on by default; context parts on but dimmer.
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(payload.parts.map((p) => p.id)),
  );
  useEffect(() => {
    setVisible(new Set(payload.parts.map((p) => p.id)));
  }, [payload.parts]);

  const toggle = useCallback((id: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback(
    (on: boolean) => setVisible(on ? new Set(payload.parts.map((p) => p.id)) : new Set()),
    [payload.parts],
  );

  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const onLoaded = useCallback((id: string) => {
    setLoaded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const ready = groups.length > 0 && groups.every((g) => loaded.has(g.system.id));

  const fitKey = useMemo(() => [...visible].sort().join('|'), [visible]);
  const baseUrl = payload.assetBase.replace(/\/+$/, '');

  // Map a GLB node name back to its part, for hover-to-name. Keyed by the
  // sanitized node name (how three exposes it on the mesh / its ancestors).
  const nameByNode = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of payload.parts) m.set(sanitizeNodeName(p.id), { id: p.id, name: p.name_en });
    return m;
  }, [payload.parts]);

  const [hoverName, setHoverName] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Bumping this re-keys <Fit>, which re-frames the model — undoing any pan/zoom.
  const [refitNonce, setRefitNonce] = useState(0);
  const recenter = useCallback(() => setRefitNonce((n) => n + 1), []);

  return (
    <div
      className="am-stage"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPointerPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onPointerLeave={() => setPointerPos(null)}
    >
      <Canvas
        className="am-canvas"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        frameloop="always"
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[5, 10, 5]} intensity={0.85} />
        <directionalLight position={[-5, -3, -5]} intensity={0.3} />
        <OrthographicCamera makeDefault position={[0, 1.2, 7]} near={0.01} far={2000} />
        <OrbitControls
          makeDefault
          enableDamping
          enableRotate
          enablePan
          enableZoom
          minZoom={0.3}
          maxZoom={16}
          // Left-drag rotates, right-drag pans, wheel zooms. On touch: one
          // finger rotates, two fingers pinch-zoom + pan.
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
        <Suspense fallback={null}>
          {groups.map((g) => (
            <SystemGroup
              key={g.system.id}
              url={`${baseUrl}/${g.system.glb}`}
              tint={g.system.tint}
              systemId={g.system.id}
              parts={g.parts}
              visible={visible}
              onLoaded={onLoaded}
            />
          ))}
        </Suspense>
        <Fit fitKey={`${fitKey}#${refitNonce}`} ready={ready} />
        <PanClamp ready={ready} />
        <Hoverer nameByNode={nameByNode} visible={visible} onHover={setHoverName} />
      </Canvas>

      {!ready && <div className="am-loading">Loading 3D…</div>}

      <button className="am-recenter" onClick={recenter} title="Recenter view" aria-label="Recenter view">
        <RecenterIcon />
      </button>

      {hoverName && pointerPos && (
        <div className="am-tooltip" style={{ left: pointerPos.x, top: pointerPos.y }}>
          {hoverName}
        </div>
      )}

      <Legend
        groups={groups}
        visible={visible}
        onToggle={toggle}
        onSetAll={setAll}
        onSelect={onSelect}
      />

      {payload.unmatched.length > 0 && (
        <div className="am-unmatched">Not found: {payload.unmatched.join(', ')}</div>
      )}
    </div>
  );
}

interface SystemGroupProps {
  url: string;
  tint: string;
  systemId: RegionSystemMeta['id'];
  parts: RegionPart[];
  visible: Set<string>;
  onLoaded: (id: string) => void;
}

function SystemGroup({ url, tint, systemId, parts, visible, onLoaded }: SystemGroupProps) {
  const { scene: source } = useGLTF(url);
  const cloned = useMemo(() => source.clone(true), [source]);

  const visibleIds = useMemo(
    () => parts.filter((p) => visible.has(p.id)).map((p) => p.id),
    [parts, visible],
  );
  const contextIds = useMemo(
    () => parts.filter((p) => p.context).map((p) => p.id),
    [parts],
  );
  const idsKey = useMemo(() => [...visibleIds].sort().join('|'), [visibleIds]);

  useEffect(() => {
    applyTint(cloned, tint, systemId, contextIds);
  }, [cloned, tint, systemId, contextIds]);

  useEffect(() => {
    setVisibleParts(cloned, visibleIds);
    onLoaded(systemId);
  }, [cloned, idsKey, systemId, onLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return <primitive object={cloned} />;
}

/** Re-fits the orthographic camera whenever the visible set OR the viewport
 *  size changes (the ortho frustum is aspect-dependent — without the size
 *  trigger the model vanishes on resize). Retries for 8 successful frames
 *  after each change to beat OrbitControls' first-frame drift. */
function Fit({ fitKey, ready }: { fitKey: string; ready: boolean }) {
  const { camera, size, scene, controls } = useThree();
  const frames = useRef(0);
  const keyRef = useRef<string | null>(null);

  useFrame(() => {
    if (!ready) return;
    const key = `${fitKey}@${Math.round(size.width)}x${Math.round(size.height)}`;
    if (keyRef.current !== key) {
      keyRef.current = key;
      frames.current = 0;
    }
    if (frames.current >= 8) return;
    const box = computeVisibleUnionBox([scene]);
    const ok = fitOrthoToBox(camera, controls, box, { width: size.width, height: size.height });
    if (ok) frames.current += 1;
  });

  return null;
}

/** Keeps panning bounded: clamps the orbit target to the model's bounding box
 *  every frame, so the structure can never be dragged off-screen. Camera follows
 *  the clamped target (offset preserved) so the view direction is unchanged. */
function PanClamp({ ready }: { ready: boolean }) {
  const { camera, scene, controls } = useThree();
  useFrame(() => {
    if (!ready) return;
    const c = controls as { target?: THREE.Vector3; update?: () => void } | null;
    const target = c?.target;
    if (!target) return;
    const box = computeVisibleUnionBox([scene]);
    if (box.isEmpty()) return;
    const cx = THREE.MathUtils.clamp(target.x, box.min.x, box.max.x);
    const cy = THREE.MathUtils.clamp(target.y, box.min.y, box.max.y);
    const cz = THREE.MathUtils.clamp(target.z, box.min.z, box.max.z);
    if (cx === target.x && cy === target.y && cz === target.z) return;
    camera.position.x += cx - target.x;
    camera.position.y += cy - target.y;
    camera.position.z += cz - target.z;
    target.set(cx, cy, cz);
    c.update?.();
  });
  return null;
}

/** Raycasts on pointer move and reports the name of the visible structure under
 *  the cursor (null when over empty space). Walks up from the hit mesh to the
 *  owning part node; skips connector/line meshes and hidden parts (so a hidden
 *  part in front can't mask a visible one behind it). */
function Hoverer({
  nameByNode,
  visible,
  onHover,
}: {
  nameByNode: Map<string, { id: string; name: string }>;
  visible: Set<string>;
  onHover: (name: string | null) => void;
}) {
  const { raycaster, camera, scene, pointer } = useThree();
  // Refs so useFrame always sees the latest props without re-subscribing.
  const mapRef = useRef(nameByNode);
  mapRef.current = nameByNode;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const lastName = useRef<string | null>(null);

  useFrame(() => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    let found: string | null = null;
    for (const h of hits) {
      const obj = h.object;
      if (!obj.visible) continue;
      if (obj.name.includes('-line') || obj.name.includes('-lin')) continue;
      for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
        const part = mapRef.current.get(o.name);
        if (part) {
          if (visibleRef.current.has(part.id)) found = part.name;
          break; // this mesh belongs to `part`; stop walking ancestors
        }
      }
      if (found) break;
    }
    if (found !== lastName.current) {
      lastName.current = found;
      onHover(found);
    }
  });

  return null;
}

interface LegendProps {
  groups: { system: RegionSystemMeta; parts: RegionPart[] }[];
  visible: Set<string>;
  onToggle: (id: string) => void;
  onSetAll: (on: boolean) => void;
  onSelect?: (part: RegionPart) => void;
}

function Legend({ groups, visible, onToggle, onSetAll, onSelect }: LegendProps) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 560,
  );
  const total = groups.reduce((n, g) => n + g.parts.length, 0);
  const shown = groups.reduce(
    (n, g) => n + g.parts.filter((p) => visible.has(p.id)).length,
    0,
  );

  return (
    <div className={`am-legend${collapsed ? ' am-collapsed' : ''}`}>
      <button
        className="am-legend-head"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand legend' : 'Collapse legend'}
      >
        <ChevronIcon open={!collapsed} />
        <span className="am-legend-title">Legend</span>
        <span className="am-muted">{shown}/{total}</span>
      </button>

      <div className="am-legend-collapse" aria-hidden={collapsed}>
        <div className="am-legend-collapse-inner">
          <div className="am-legend-actions">
            <button className="am-btn" onClick={() => onSetAll(true)}>Show all</button>
            <button className="am-btn" onClick={() => onSetAll(false)}>Hide all</button>
          </div>
          <div className="am-legend-body">
            {groups.map((g) => (
              <div key={g.system.id} className="am-sys">
                {groups.length > 1 && <div className="am-sys-head">{g.system.label_en}</div>}
                {g.parts.map((p) => {
                  const on = visible.has(p.id);
                  return (
                    <div key={p.id} className={`am-row${on ? '' : ' am-off'}${p.context ? ' am-ctx' : ''}`}>
                      <button
                        className="am-eye"
                        title={on ? 'Hide' : 'Show'}
                        aria-label={on ? 'Hide' : 'Show'}
                        onClick={() => onToggle(p.id)}
                      >
                        <span className="am-swatch" style={{ background: g.system.tint }} />
                        {on ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                      <button className="am-name" onClick={() => onSelect?.(p)} title="Ask about this structure">
                        <span className="am-name-en">{p.name_en}</span>
                        {p.context && <span className="am-ctx-tag">ctx</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`am-chev${open ? ' am-chev-open' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function RecenterIcon() {
  // Crosshair-in-a-frame: "fit / recenter".
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
