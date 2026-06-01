import type { PartsCatalog } from './vendor/types';
import { resolveQueryToParts } from './vendor/resolveParts';
import { getSystem } from './catalog';
import { REGION_SCHEMA, type RegionPart, type RegionPayload, type RegionSystemMeta } from './shared';

/** Hard cap on how many structures one region renders. This enforces the
 *  product rule: we always show a bounded REGION, never the whole model. Even
 *  if a query expands huge, we truncate. */
export const MAX_REGION_PARTS = 60;

export interface BuildRegionResult {
  payload: RegionPayload;
  /** Short human summary for the model to read alongside the widget. */
  summary: string;
}

/** Resolve a list of structure/region queries into a bounded RegionPayload. */
export function buildRegion(
  catalog: PartsCatalog,
  queries: string[],
  assetBase: string,
  title?: string,
): BuildRegionResult {
  const parts: RegionPart[] = [];
  const seen = new Set<string>();
  const unmatched: string[] = [];
  const expanded: NonNullable<RegionPayload['expanded']> = [];
  let truncated = false;

  for (const raw of queries) {
    const query = (raw ?? '').trim();
    if (!query) continue;
    const resolved = resolveQueryToParts(catalog, query);
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

  const resolvedTitle = title?.trim() || deriveTitle(parts, expanded);

  const payload: RegionPayload = {
    schema: REGION_SCHEMA,
    title: resolvedTitle,
    assetBase,
    parts,
    systems,
    unmatched,
    expanded: expanded.length ? expanded : undefined,
  };

  const summary = buildSummary(payload, truncated);
  return { payload, summary };
}

/** Strip the trailing Blender duplicate suffix (".001") from a display name.
 *  The part id keeps the suffix (it must match the GLB node), only the label
 *  is cleaned — mirrors the web app's quiz `cleanName`. */
function cleanName(name: string): string {
  return name.replace(/\.\d{3}$/, '');
}

function deriveTitle(
  parts: RegionPart[],
  expanded: NonNullable<RegionPayload['expanded']>,
): string {
  if (expanded.length === 1 && parts.length > 1) return expanded[0]!.label;
  if (parts.length === 0) return 'Anatomy';
  const names = [...new Set(parts.map((p) => p.name_en))];
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

function buildSummary(payload: RegionPayload, truncated: boolean): string {
  const names = [...new Set(payload.parts.map((p) => p.name_en))];
  const lines: string[] = [];
  if (payload.parts.length === 0) {
    lines.push('No matching anatomical structures were found.');
  } else {
    lines.push(
      `Rendering an interactive 3D view of ${payload.parts.length} structure(s): ${names.join(', ')}.`,
    );
  }
  if (payload.unmatched.length) {
    lines.push(`Not found: ${payload.unmatched.join(', ')}.`);
  }
  if (truncated) {
    lines.push(`Capped at ${MAX_REGION_PARTS} structures to keep the region focused.`);
  }
  return lines.join(' ');
}
