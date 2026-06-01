// Upload the GLB models + parts catalog to a public Supabase Storage bucket,
// reusing the existing anatom3d project. Uses the Storage REST API directly
// (native fetch) — no @supabase/supabase-js dependency.
//
// Run (service-role key must be in the environment, never committed):
//   npx tsx --env-file=.env scripts/upload-assets.ts
//
// Env:
//   SUPABASE_URL                e.g. https://uafyfwyyqzunabpuftue.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   service-role key (server-side only)
//   MODELS_BUCKET               optional, default "models"
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..');
const GLB_DIR = resolve(REPO, 'assets/glb');
const CATALOG = resolve(REPO, 'assets/parts-catalog.json');

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = process.env.MODELS_BUCKET ?? 'models';

if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const authHeaders = { Authorization: `Bearer ${KEY}`, apikey: KEY };

async function ensureBucket(): Promise<void> {
  const get = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: authHeaders });
  if (get.ok) {
    console.log(`bucket "${BUCKET}" exists`);
    return;
  }
  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!create.ok) {
    const t = await create.text();
    throw new Error(`bucket create failed: ${create.status} ${t}`);
  }
  console.log(`bucket "${BUCKET}" created (public)`);
}

async function upload(path: string, body: Buffer, contentType: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': '86400' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upload ${path} failed: ${res.status} ${t}`);
  }
  console.log(`  ✓ ${path} (${(body.length / 1e6).toFixed(1)} MB)`);
}

async function main(): Promise<void> {
  await ensureBucket();

  console.log('uploading catalog…');
  await upload('parts-catalog.json', readFileSync(CATALOG), 'application/json');

  const glbs = readdirSync(GLB_DIR).filter((f) => f.endsWith('.glb'));
  console.log(`uploading ${glbs.length} GLBs…`);
  for (const f of glbs) {
    await upload(`glb/${basename(f)}`, readFileSync(resolve(GLB_DIR, f)), 'model/gltf-binary');
  }

  const base = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
  console.log('\nDone. Public asset base:');
  console.log(`  ASSET_BASE_URL=${base}`);
  console.log(`  (catalog: ${base}/parts-catalog.json, glbs: ${base}/glb/<system>.glb)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
