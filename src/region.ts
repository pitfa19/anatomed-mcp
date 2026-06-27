import type { Part, PartsCatalog, SystemId } from './vendor/types';
import { resolveQueryToParts } from './vendor/resolveParts.js';
import { getSystem } from './catalog.js';
import { contextFor } from './neighbors.js';
import {
  REGION_SCHEMA,
  type RegionDetail,
  type RegionPart,
  type RegionPayload,
  type RegionSystemMeta,
} from './shared.js';

/** Hard cap on focus structures. Enforces the product rule: always a bounded
 *  REGION, never the whole model. */
export const MAX_REGION_PARTS = 60;

/** Systems whose structures hang in space without a skeletal reference; when a
 *  focus is made up only of these, an isolated view anchors them to their
 *  nearest bones. */
const FLOATING_SYSTEMS = new Set<SystemId>(['muscles', 'nerves', 'vessels', 'insertions']);

/** Per-detail-level context tuning: how many nearest neighbours to pull per
 *  focus part, and the total context cap. */
const DETAIL_TUNING: Record<RegionDetail, { perPart: number; cap: number }> = {
  isolated: { perPart: 0, cap: 0 },
  related: { perPart: 6, cap: 14 },
  regional: { perPart: 14, cap: 30 },
};

export interface BuildRegionResult {
  payload: RegionPayload;
  summary: string;
}

export interface BuildRegionOptions {
  title?: string;
  detail?: RegionDetail;
}

/** Resolve queries into a bounded RegionPayload, optionally adding surrounding
 *  context structures (nearest neighbours) at higher detail levels. */
export function buildRegion(
  catalog: PartsCatalog,
  queries: string[],
  assetBase: string,
  opts: BuildRegionOptions = {},
): BuildRegionResult {
  const detail: RegionDetail = opts.detail ?? 'isolated';
  const parts: RegionPart[] = [];
  const seen = new Set<string>();
  const unmatched: string[] = [];
  const expanded: NonNullable<RegionPayload['expanded']> = [];
  let truncated = false;

  for (const raw of queries) {
    const query = (raw ?? '').trim();
    if (!query) continue;
    let resolved = resolveQueryToParts(catalog, query);
    // Insertion footprints (728 attachment patches) pollute fuzzy matching:
    // e.g. "Biceps brachii" lands on "Biceps brachii muscle-Radial insertion"
    // rather than the muscle. When a query lands on a lone insertion and didn't
    // ask for one, prefer a non-insertion match if one exists.
    if (
      resolved &&
      resolved.parts.length === 1 &&
      resolved.parts[0]!.system === 'insertions' &&
      !/insertion|attach|origin|hvati/i.test(query)
    ) {
      const alt = resolveQueryToParts(withoutInsertions(catalog), query);
      if (alt) resolved = alt;
    }
    if (!resolved) {
      unmatched.push(query);
      continue;
    }
    if (resolved.expanded) {
      expanded.push({ query, label: resolved.expanded.label, count: resolved.expanded.count });
    }
    for (const p of resolved.parts) {
      if (seen.has(p.id)) continue;
      if (parts.length >= MAX_REGION_PARTS) {
        truncated = true;
        break;
      }
      seen.add(p.id);
      parts.push({
        id: p.id, // raw id — must match the GLB node name
        name_en: cleanName(p.name_en),
        name_lat: cleanName(p.name_lat),
        system: p.system,
        side: p.side,
      });
    }
    if (truncated) break;
  }

  // Surrounding context (structures the focus parts pass through / near).
  const focusIds = parts.map((p) => p.id);
  const tuning = DETAIL_TUNING[detail];
  let contextCount = 0;
  // Collapse left/right mirrors so the legend shows each context structure once
  // (e.g. one "Clavicle", not two), matching the group dedup behaviour.
  const ctxNames = new Set<string>();
  const addContext = (candidates: Part[]) => {
    for (const p of candidates) {
      if (seen.has(p.id)) continue;
      const display = cleanName(p.name_en);
      if (ctxNames.has(display)) {
        seen.add(p.id);
        continue;
      }
      ctxNames.add(display);
      seen.add(p.id);
      parts.push({
        id: p.id,
        name_en: display,
        name_lat: cleanName(p.name_lat),
        system: p.system,
        side: p.side,
        context: true,
      });
      contextCount++;
    }
  };

  if (tuning.perPart > 0 && focusIds.length > 0) {
    addContext(contextFor(catalog, focusIds, tuning.perPart, tuning.cap));
  } else if (detail === 'isolated' && focusIds.length > 0) {
    // Anchor: a muscle/nerve/vessel shown alone floats in empty space. When the
    // focus is *only* such structures (no bone), add its nearest few bones as
    // translucent ghosts for orientation. Bone/organ focuses are self-contained.
    const focusSystems = new Set(parts.map((p) => p.system));
    if ([...focusSystems].every((s) => FLOATING_SYSTEMS.has(s))) {
      addContext(contextFor(catalog, focusIds, 10, 5, 'skeleton'));
    }
  }

  const sysIds = [...new Set(parts.map((p) => p.system))];
  const systems: RegionSystemMeta[] = sysIds.map((id) => {
    const s = getSystem(catalog, id);
    return {
      id,
      label_en: s?.label_en ?? id,
      tint: s?.tint ?? '#cccccc',
      glb: `glb/${id}.glb`,
    };
  });

  const focusParts = parts.filter((p) => !p.context);
  const resolvedTitle = opts.title?.trim() || deriveTitle(focusParts, expanded);

  const payload: RegionPayload = {
    schema: REGION_SCHEMA,
    title: resolvedTitle,
    assetBase,
    parts,
    systems,
    detail,
    unmatched,
    expanded: expanded.length ? expanded : undefined,
  };

  const summary = buildSummary(payload, focusParts.length, contextCount, truncated);
  return { payload, summary };
}

/** Strip the trailing Blender duplicate suffix (".001") from a display name. */
function cleanName(name: string): string {
  return name.replace(/\.\d{3}$/, '');
}

/** A catalog view with the `insertions` system removed (memoised per catalog so
 *  the resolver's per-catalog index is built once). Used to retry resolution
 *  when a query lands on a lone insertion footprint. */
const noInsertCache = new WeakMap<PartsCatalog, PartsCatalog>();
function withoutInsertions(catalog: PartsCatalog): PartsCatalog {
  let c = noInsertCache.get(catalog);
  if (!c) {
    c = { ...catalog, parts: catalog.parts.filter((p) => p.system !== 'insertions') };
    noInsertCache.set(catalog, c);
  }
  return c;
}

/** Join up to `max` names; beyond that, list a few and append "+N more". */
function listOrCount(names: string[], max = 6): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
}

function deriveTitle(
  focusParts: RegionPart[],
  expanded: NonNullable<RegionPayload['expanded']>,
): string {
  if (expanded.length === 1 && focusParts.length > 1) return expanded[0]!.label;
  if (focusParts.length === 0) return 'Anatomy';
  const names = [...new Set(focusParts.map((p) => p.name_en))];
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

function buildSummary(
  payload: RegionPayload,
  focusCount: number,
  contextCount: number,
  truncated: boolean,
): string {
  const focusNames = [...new Set(payload.parts.filter((p) => !p.context).map((p) => p.name_en))];
  const lines: string[] = [];
  if (focusCount === 0) {
    lines.push('No matching anatomical structures were found.');
  } else {
    lines.push(`Rendering an interactive 3D view of ${describeFocus(payload, focusNames)}.`);
  }
  if (contextCount > 0) {
    const ctxNames = [...new Set(payload.parts.filter((p) => p.context).map((p) => p.name_en))];
    if (payload.detail === 'isolated') {
      lines.push(`Nearest bones shown translucent for orientation: ${listOrCount(ctxNames)}.`);
    } else {
      lines.push(
        `Surrounding context (${payload.detail}, shown translucent): ${listOrCount(ctxNames)}.`,
      );
    }
  }
  if (payload.unmatched.length) lines.push(`Not found: ${payload.unmatched.join(', ')}.`);
  if (truncated) lines.push(`Focus capped at ${MAX_REGION_PARTS} structures.`);
  return lines.join(' ');
}

/** A compact phrase for the focus set: a named group reads as "the Hand bones
 *  (27 structures)"; a handful of structures are listed; long ad-hoc sets are
 *  abbreviated. Keeps the agent-facing summary terse instead of dumping 27 names. */
function describeFocus(payload: RegionPayload, focusNames: string[]): string {
  const exp = payload.expanded;
  if (exp && exp.length === 1 && exp[0]!.count === focusNames.length) {
    return `the ${exp[0]!.label} (${exp[0]!.count} structures)`;
  }
  if (focusNames.length > 8) return `${focusNames.length} structures: ${listOrCount(focusNames)}`;
  return focusNames.join(', ');
}
