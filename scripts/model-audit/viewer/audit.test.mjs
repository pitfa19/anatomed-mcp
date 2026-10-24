import test from 'node:test'
import assert from 'node:assert/strict'
import { recordKey, safeChild, summarize } from './core.mjs'
import { pixelEvidence, structuralFailures } from './evidence.mjs'

const valid = () => ({ nodeMatches: 1, geometry: { vertices: 3, triangles: 1, nonfinite: 0 }, visibleMeshes: ['exact-node'], unexpectedVisible: [], views: [{ pixels: { changed: 12, edge: 0 } }], errors: [] })

test('artifact keys preserve every suffix and occurrence without unsafe paths', () => {
  const ids = ['part', 'part.001', 'part.002', 'part_001', 'part/r', '../part', 'part:r']
  const keys = ids.map(id => recordKey('catalog', 'skeleton', id, 0))
  assert.equal(new Set(keys).size, ids.length)
  assert.ok(keys.every(key => /^[\w-]+$/.test(key)))
  assert.notEqual(recordKey('catalog', 'skeleton', 'part', 1), recordKey('catalog', 'skeleton', 'part', 2))
  assert.notEqual(recordKey('catalog', 'skeleton', 'part', 1), recordKey('synthetic-export', 'skeleton', 'part', 1))
})
test('artifact paths cannot escape root or exploit prefix siblings', () => {
  assert.equal(safeChild('/a/b', 'c.json'), '/a/b/c.json')
  assert.throws(() => safeChild('/a/b', '../b2/c.json'))
  assert.throws(() => safeChild('/a/b', '/etc/passwd'))
})
test('coverage is not complete when one of thousands is missing', () => {
  assert.equal(summarize(Array.from({ length: 3539 }, () => ({ status: 'pass-structural' })), 3540).complete, false)
  assert.deepEqual(summarize([{ status: 'error' }, { status: 'fail' }], 2), { expected: 2, completed: 2, passed: 0, failed: 1, errors: 1, complete: true })
})
test('a nonblank image without matching geometry must never pass', () => {
  const failures = structuralFailures({ views: [{ pixels: { changed: 9999, edge: 0 } }] })
  assert.ok(failures.includes('missing-or-ambiguous-exact-node'))
  assert.ok(failures.includes('no-triangle-geometry'))
  assert.ok(failures.includes('no-visible-target-mesh'))
})
test('duplicate matching nodes are not accepted', () => {
  assert.ok(structuralFailures({ ...valid(), nodeMatches: 2 }).includes('missing-or-ambiguous-exact-node'))
})
test('visible unrelated geometry fails isolation even with target pixels', () => {
  assert.ok(structuralFailures({ ...valid(), unexpectedVisible: ['unrelated'] }).includes('isolation-leak'))
})
test('hidden nonconnector target fragments fail even with visible siblings', () => {
  assert.ok(structuralFailures({ ...valid(), hiddenRenderableTargetMeshes: ['missing-fragment'] }).includes('hidden-target-geometry'))
})
test('nonfinite coordinates, empty geometry and runtime errors fail independently', () => {
  assert.ok(structuralFailures({ ...valid(), geometry: { vertices: 3, triangles: 1, nonfinite: 1 } }).includes('nonfinite-geometry'))
  assert.ok(structuralFailures({ ...valid(), geometry: { vertices: 3, triangles: 0 } }).includes('no-triangle-geometry'))
  assert.ok(structuralFailures({ ...valid(), errors: ['context lost'] }).includes('runtime-errors'))
})
test('default blank view fails even when an alternate view renders', () => {
  assert.ok(structuralFailures({ ...valid(), views: [{ pixels: { changed: 0, edge: 0 } }, { pixels: { changed: 55, edge: 0 } }] }).includes('blank-default-view'))
})
test('edge contact is a clipping warning that prevents a clean structural pass', () => {
  assert.ok(structuralFailures({ ...valid(), views: [{ pixels: { changed: 55, edge: 3 } }] }).includes('possible-viewport-clipping'))
})
test('valid multi-signal evidence has no structural failure, not an anatomical correctness claim', () => {
  assert.deepEqual(structuralFailures(valid()), [])
})
test('opaque non-model background produces zero differential render pixels', () => {
  const background = Uint8Array.from({ length: 256 }, (_, i) => i % 4 === 3 ? 255 : 45)
  assert.equal(pixelEvidence(background, background, 8, 8).changed, 0)
})
test('model pixel bounds use WebGL bottom-left coordinates and flag border pixels', () => {
  const background = new Uint8Array(8 * 8 * 4)
  const image = background.slice()
  image[(3 * 8 + 4) * 4 + 3] = 255
  let p = pixelEvidence(image, background, 8, 8)
  assert.deepEqual(p.bounds, [4, 3, 4, 3])
  assert.equal(p.edge, 0)
  image[0] = 255
  p = pixelEvidence(image, background, 8, 8)
  assert.equal(p.changed, 2)
  assert.equal(p.edge, 1)
})
