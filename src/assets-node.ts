import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PartsCatalog } from './vendor/types';
import { primeNeighbors, type NeighborMap } from './neighbors.js';

// Node-only asset loaders. This is the ONLY module in the region graph that reads from
// disk (node:fs), so the browser-safe modules (catalog.ts, neighbors.ts, region.ts) stay
// fs-free and the widget can bundle buildRegion. The server loads the data here and
// primes the pure modules; browser hosts (widget, Obsidian plugin) fetch + prime instead.

// Resolved from CWD: project root locally, the Lambda task root on Vercel.
const CATALOG_PATH = resolve(process.cwd(), 'assets/parts-catalog.json');
const NEIGHBORS_PATH = resolve(process.cwd(), 'assets/parts-neighbors.json');

let catalogCache: PartsCatalog | null = null;

/** Load the committed parts catalog from disk (once). Drops Z-Anatomy top-level
 *  group containers (".g") exactly like the web app's loader. */
export function loadCatalog(): PartsCatalog {
  if (catalogCache) return catalogCache;
  const data = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as PartsCatalog;
  data.parts = data.parts.filter((p) => !p.id.endsWith('.g'));
  catalogCache = data;
  return data;
}

let neighborsPrimed = false;

/** Read the neighbour map from disk and prime neighbors.ts (once). Lazy on purpose:
 *  only the first related/regional request pays the ~5.96 MB parse; isolated requests
 *  never touch it (preserves cold-start on Vercel). */
export function primeNeighborsFromDisk(): void {
  if (neighborsPrimed) return;
  const map = JSON.parse(readFileSync(NEIGHBORS_PATH, 'utf8')) as NeighborMap;
  primeNeighbors(map);
  neighborsPrimed = true;
}
