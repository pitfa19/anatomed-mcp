import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildRegion } from '../src/region.js';
import type { PartsCatalog } from '../src/vendor/types.js';

const catalog = JSON.parse(readFileSync(new URL('../assets/parts-catalog.json', import.meta.url), 'utf8')) as PartsCatalog;

function resolve(query: string) {
  return buildRegion(catalog, [query], 'test', { detail: 'isolated' }).payload;
}

test('generic carotid is declined as ambiguous instead of selecting a branch', () => {
  const payload = resolve('carotid artery');
  assert.equal(payload.parts.length, 0);
  assert.deepEqual(payload.unmatched, []);
  assert.equal(payload.issues?.[0]?.kind, 'ambiguous');
  assert.match(payload.issues?.[0]?.message ?? '', /common, internal, or external/i);
});

test('unsided carotid branches are declined instead of mixing sides', () => {
  for (const query of ['common carotid artery', 'internal carotid artery', 'external carotid artery']) {
    const payload = resolve(query);
    assert.equal(payload.parts.length, 0);
    assert.deepEqual(payload.unmatched, []);
    assert.equal(payload.issues?.[0]?.kind, 'ambiguous');
    assert.deepEqual(payload.issues?.[0]?.options?.map((option) => option.split(' ')[0]), ['left', 'right']);
  }
});

test('Latin Cor expands to heart chambers and never resolves to Cornea', () => {
  const payload = resolve('Cor');
  assert.deepEqual(new Set(payload.parts.map((part) => part.name_en)), new Set(['Right atrium', 'Left atrium', 'Right ventricle', 'Left ventricle']));
  assert.equal(payload.parts.some((part) => part.name_en === 'Cornea'), false);
  assert.equal(payload.expanded?.[0]?.label, 'Heart (four chambers)');
});

test('heart expands to an explicit bounded four-chamber composite', () => {
  const payload = resolve('heart');
  assert.equal(payload.parts.length, 4);
  assert.equal(payload.expanded?.[0]?.label, 'Heart (four chambers)');
});

test('sternum expands to manubrium, body, and xiphoid process', () => {
  const payload = resolve('sternum');
  assert.deepEqual(new Set(payload.parts.map((part) => part.name_en)), new Set(['Manubrium of sternum', 'Body of sternum', 'Xiphoid process']));
});

test('femoral neck and Latin synonym are explicitly unavailable', () => {
  for (const query of ['femoral neck', 'neck of femur', 'Collum femoris']) {
    const payload = resolve(query);
    assert.equal(payload.parts.length, 0);
    assert.equal(payload.issues?.[0]?.kind, 'unavailable');
  }
});

test('invented ligament remains unmatched without substitution', () => {
  const payload = resolve('ligamentum pitlovicense');
  assert.equal(payload.parts.length, 0);
  assert.deepEqual(payload.unmatched, ['ligamentum pitlovicense']);
  assert.equal(payload.issues, undefined);
});
