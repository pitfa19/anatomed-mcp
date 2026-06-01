import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { PartsCatalog, SystemId, SystemMeta } from './vendor/types';

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(here, '../assets/parts-catalog.json');

let cache: PartsCatalog | null = null;

/** Load the committed parts catalog from disk (once). Drops Z-Anatomy
 *  top-level group containers (".g") exactly like the web app's loader. */
export function loadCatalog(): PartsCatalog {
  if (cache) return cache;
  const data = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as PartsCatalog;
  data.parts = data.parts.filter((p) => !p.id.endsWith('.g'));
  cache = data;
  return data;
}

export function getSystem(catalog: PartsCatalog, id: SystemId): SystemMeta | null {
  return catalog.systems.find((s) => s.id === id) ?? null;
}
