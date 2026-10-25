// Immutable release uploader for the existing Supabase models bucket.
// Dry-run is the default. No bucket creation, overwrite, deletion, or secret logging.
// npm run upload:assets -- --manifest ../anatomed-obsidian/src/assetPack.generated.json
// Add --upload only after approving publication. --verify-only needs no credentials.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const RELEASE = 'releases/2026-10-24-v3';
const DEFAULT_URL = 'https://uafyfwyyqzunabpuftue.supabase.co';
const SYSTEMS = ['insertions', 'joints', 'lymphoid', 'muscles', 'nerves', 'organs', 'regions', 'skeleton', 'vessels'];
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type Entry = { path: string; bytes: number; sha256: string };
export type Manifest = { release: string; publicObjects: Entry[] };
export type UploadOptions = {
  url: string; bucket: string; key?: string;
  mode: 'dry-run' | 'upload' | 'verify-only'; fetcher?: typeof fetch;
};

export function loadRelease(manifest: Manifest, assetDir: string): Map<string, Uint8Array> {
  const expected = [...SYSTEMS.map((id) => `glb/${id}.glb`), 'parts-neighbors.json', 'parts-catalog.json'].sort();
  if (manifest.release !== RELEASE || JSON.stringify(manifest.publicObjects.map((e) => e.path).sort()) !== JSON.stringify(expected)) {
    throw new Error('Manifest must describe the complete immutable nine-system release');
  }
  const files = new Map<string, Uint8Array>();
  for (const entry of manifest.publicObjects) {
    const bytes = new Uint8Array(readFileSync(resolve(assetDir, entry.path)));
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error(`Local asset differs from approved pack: ${entry.path}`);
    files.set(entry.path, bytes);
  }
  return files;
}

export async function uploadRelease(files: Map<string, Uint8Array>, options: UploadOptions): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  if (!/^https:\/\//.test(options.url) || !/^[a-zA-Z0-9_-]+$/.test(options.bucket)) throw new Error('Invalid storage destination');
  const publicBase = `${options.url.replace(/\/+$/, '')}/storage/v1/object/public/${options.bucket}/${RELEASE}`;
  const request = (url: string, init?: RequestInit) => fetcher(url, { ...init, signal: AbortSignal.timeout(120_000) });
  const missing: string[] = [];
  // Check every existing object before writing anything. Identical bytes are resumable.
  for (const [path, local] of files) {
    if (!/^(glb\/[a-z]+\.glb|parts-(catalog|neighbors)\.json)$/.test(path)) throw new Error('Unsafe object path');
    const response = await request(`${publicBase}/${path}`, { cache: 'no-store' });
    if (response.ok) {
      if (digest(new Uint8Array(await response.arrayBuffer())) !== digest(local)) throw new Error(`Immutable object conflict: ${path}. Use a new release prefix.`);
    } else {
      const detail = await response.json().catch(() => ({})) as { statusCode?: string | number };
      if (response.status !== 404 && !(response.status === 400 && Number(detail.statusCode) === 404)) {
        throw new Error(`Cannot establish object absence: ${path} (${response.status})`);
      }
      missing.push(path);
    }
  }
  if (options.mode === 'verify-only' && missing.length) throw new Error(`Public release incomplete: ${missing.join(', ')}`);
  if (options.mode === 'dry-run') {
    console.log(JSON.stringify({ release: RELEASE, existing: files.size - missing.length, toUpload: missing }));
    return;
  }
  if (options.mode === 'upload') {
    if (!options.key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --upload');
    for (const path of missing) {
      const response = await request(`${options.url.replace(/\/+$/, '')}/storage/v1/object/${options.bucket}/${RELEASE}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.key}`, apikey: options.key,
          'Content-Type': path.endsWith('.glb') ? 'model/gltf-binary' : 'application/json',
          'x-upsert': 'false', 'cache-control': '31536000',
        },
        body: files.get(path) as Uint8Array<ArrayBuffer>,
      });
      // A concurrent creator must fail rather than be overwritten.
      if (!response.ok) throw new Error(`Create-only upload failed: ${path} (${response.status})`);
    }
    // Credentials are deliberately omitted from public-read verification.
    await uploadRelease(files, { ...options, mode: 'verify-only', key: undefined });
  }
  console.log(JSON.stringify({ release: RELEASE, publicObjectsVerified: files.size }));
}

async function main() {
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf('--manifest');
  if (manifestIndex < 0 || !args[manifestIndex + 1] || (args.includes('--upload') && args.includes('--verify-only'))) {
    throw new Error('Usage: upload-assets.ts --manifest <approved metadata.json> [--upload | --verify-only]');
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const manifest = JSON.parse(readFileSync(resolve(args[manifestIndex + 1]), 'utf8')) as Manifest;
  const files = loadRelease(manifest, resolve(root, 'assets'));
  await uploadRelease(files, {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? DEFAULT_URL,
    bucket: process.env.MODELS_BUCKET ?? 'models', key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    mode: args.includes('--upload') ? 'upload' : args.includes('--verify-only') ? 'verify-only' : 'dry-run',
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : 'Upload failed'); process.exitCode = 1; });
}
