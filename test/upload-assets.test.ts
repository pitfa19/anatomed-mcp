import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadRelease, RELEASE, type UploadOptions } from '../scripts/upload-assets.js';

const files = new Map([['glb/skeleton.glb', new Uint8Array([1, 2, 3])], ['parts-catalog.json', new Uint8Array([4, 5])]]);
function fixture(existing: Map<string, Uint8Array> = new Map(), failStatus?: number) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    assert.ok(url.includes(`/${RELEASE}/`));
    const path = url.split(`/${RELEASE}/`)[1];
    if (init?.method === 'POST') {
      assert.equal(new Headers(init.headers).get('x-upsert'), 'false');
      if (failStatus) return new Response('{}', { status: failStatus });
      assert.equal(existing.has(path), false);
      existing.set(path, new Uint8Array(init.body as ArrayBuffer));
      return new Response('{}');
    }
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    const bytes = existing.get(path);
    return bytes ? new Response(bytes as Uint8Array<ArrayBuffer>) : new Response('{"statusCode":"404"}', { status: 400 });
  };
  const options: UploadOptions = { url: 'https://storage.invalid', bucket: 'models', key: 'fixture-only', mode: 'upload', fetcher: fetcher as typeof fetch };
  return { calls, options, existing };
}

test('dry run never writes or needs a key', async () => {
  const f = fixture();
  await uploadRelease(files, { ...f.options, mode: 'dry-run', key: undefined });
  assert.equal(f.calls.length, 2);
  assert.equal(f.existing.size, 0);
});
test('create only, read back all bytes, rerun skips existing objects', async () => {
  const f = fixture();
  await uploadRelease(files, f.options);
  assert.equal(f.calls.filter((c) => c.init?.method === 'POST').length, 2);
  assert.deepEqual(f.existing, files);
  const count = f.calls.length;
  await uploadRelease(files, f.options);
  assert.equal(f.calls.slice(count).filter((c) => c.init?.method === 'POST').length, 0);
});
test('different existing bytes abort before any upload', async () => {
  const f = fixture(new Map([['parts-catalog.json', new Uint8Array([0, 0])]]));
  await assert.rejects(uploadRelease(files, f.options), /Immutable object conflict/);
  assert.equal(f.calls.some((c) => c.init?.method === 'POST'), false);
});
test('verify-only requires complete public release', async () => {
  const f = fixture();
  await assert.rejects(uploadRelease(files, { ...f.options, mode: 'verify-only' }), /incomplete/);
  assert.equal(f.calls.some((c) => c.init?.method === 'POST'), false);
});
test('concurrent creation fails closed with no overwrite retry', async () => {
  const f = fixture(new Map(), 409);
  await assert.rejects(uploadRelease(files, f.options), /Create-only upload failed/);
  assert.equal(f.calls.filter((c) => c.init?.method === 'POST').length, 1);
});
test('permission and server errors are not treated as object absence', async () => {
  for (const status of [401, 403, 500]) {
    const f = fixture();
    await assert.rejects(uploadRelease(files, { ...f.options, fetcher: async () => new Response('{}', { status }) }), /Cannot establish object absence/);
    assert.equal(f.calls.length, 0);
  }
});
