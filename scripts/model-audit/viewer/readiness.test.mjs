import test from 'node:test'
import assert from 'node:assert/strict'
import { isMountedSystemReady } from './readiness.mjs'

const scene = (children) => ({ children, traverse(fn) { fn(this); children.forEach(fn) } })
const light = { uuid: 'light', isLight: true }
const hiddenMesh = { uuid: 'clone-new', isMesh: true, visible: false, name: 'not-requested-target' }
const input = { decoded: true, loading: false, previousChildren: 'light|clone-old', samePartition: false }

test('loader callback and lights-only Canvas never establish actual viewer readiness', () => {
  assert.equal(isMountedSystemReady({ ...input, scene: scene([light]) }), false)
  assert.equal(isMountedSystemReady({ ...input, samePartition: true, scene: scene([light]) }), false)
})
test('mounted system is not ready while viewer loading indicator remains', () => {
  assert.equal(isMountedSystemReady({ ...input, loading: true, scene: scene([light, hiddenMesh]) }), false)
})
test('hidden system meshes satisfy mount even when requested target does not exist', () => {
  assert.equal(isMountedSystemReady({ ...input, scene: scene([light, hiddenMesh]) }), true)
})
test('later part must await its own clone transition, except identical partition', () => {
  const mounted = scene([light, hiddenMesh])
  assert.equal(isMountedSystemReady({ ...input, previousChildren: 'light|clone-new', scene: mounted }), false)
  assert.equal(isMountedSystemReady({ ...input, previousChildren: 'light|clone-new', samePartition: true, scene: mounted }), true)
})
test('missing decode or Canvas is not ready', () => {
  assert.equal(isMountedSystemReady({ ...input, decoded: false, scene: scene([hiddenMesh]) }), false)
  assert.equal(isMountedSystemReady({ ...input, scene: null }), false)
})
