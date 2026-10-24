import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyQuery, queriesFor, displayId } from './query-audit.mjs'

const clean = s => s.replace(/\.\d{3}$/, '')
const left = { id: 'Structure.l.001', name_en: 'Structure', side: 'l', system: 'nerves' }
const right = { id: 'Structure.r.001', name_en: 'Structure', side: 'r', system: 'nerves' }
const other = { id: 'Unrelated.r', name_en: 'Unrelated', side: 'r', system: 'nerves' }
const duplicate = { ...left, id: 'Structure.l.002' }
const byId = new Map([left, right, other, duplicate].map(p => [p.id, p]))
const payload = (parts, issues = []) => ({ parts, issues, unmatched: parts.length || issues.length ? [] : ['Structure'] })

test('every query keeps exact expected ID including all suffixes', () => {
  const rows = queriesFor(left, clean)
  assert.equal(rows.length, 3)
  assert.ok(rows.every(r => r.expectedId === 'Structure.l.001'))
  assert.deepEqual(rows.map(r => r.query), ['Structure', 'Structure', 'left Structure'])
  assert.equal(displayId('Structure.001.r', clean), 'Structure')
  assert.equal(queriesFor({ ...left, side: undefined }, clean).length, 2)
})
test('expected ID inclusion is independent from expansion cardinality', () => {
  assert.equal(classifyQuery(left, 'Structure', payload([left]), byId).outcome, 'contains_expected_singleton')
  const r = classifyQuery(left, 'Structure', payload([left, right]), byId)
  assert.equal(r.outcome, 'contains_expected_expansion')
  assert.equal(r.containsExpectedId, true)
  assert.equal(r.exactSingleton, false)
})
test('default-side selection is not confused with an explicit wrong-side request', () => {
  const r = classifyQuery(left, 'Structure', payload([right]), byId, [left.id, right.id])
  assert.equal(r.outcome, 'default_opposite_side_counterpart')
  assert.equal(r.queryIsCatalogAmbiguous, true)
  assert.match(r.interpretation, /Not automatically a defect/)
})
test('explicit left request returning only right is flagged separately', () => {
  const r = classifyQuery(left, 'left Structure', payload([right]), byId)
  assert.equal(r.outcome, 'explicit_wrong_side')
  assert.equal(r.explicitQuerySide, 'l')
  assert.deepEqual(r.oppositeSideIds, [right.id])
})
test('opposite-side unrelated structure is not labeled a counterpart default', () => {
  const r = classifyQuery(left, 'Structure', payload([other]), byId)
  assert.equal(r.outcome, 'unspecified_side_other_structure')
  assert.deepEqual(r.counterpartIds, [])
})
test('legitimate ambiguity declines are distinct from unmatched', () => {
  const r = classifyQuery(left, 'Structure', payload([], [{ kind: 'ambiguous', message: 'Specify branch' }]), byId)
  assert.equal(r.outcome, 'ambiguous_decline')
  assert.match(r.interpretation, /not automatically a defect/)
  assert.equal(classifyQuery(left, 'Structure', payload([]), byId).outcome, 'unmatched')
})
test('unavailable declines remain separate from ambiguity', () => {
  assert.equal(classifyQuery(left, 'Structure', payload([], [{ kind: 'unavailable' }]), byId).outcome, 'unavailable_decline')
})
test('same-name duplicate row mismatch is not automatically a semantic defect', () => {
  const r = classifyQuery(left, 'Structure', payload([duplicate]), byId, [left.id, duplicate.id])
  assert.equal(r.outcome, 'ambiguous_name_other_catalog_row')
  assert.equal(r.containsExpectedId, false)
})
test('context-only expected ID does not count as requested focus coverage', () => {
  const r = classifyQuery(left, 'Structure', payload([{ ...left, context: true }, right]), byId)
  assert.equal(r.containsExpectedId, false)
})
test('catalog label contradictory to row side is not a wrong-side resolver claim', () => {
  const r = classifyQuery(left, 'right Structure', payload([right]), byId)
  assert.equal(r.outcome, 'query_catalog_side_conflict')
  assert.equal(r.queryConflictsExpectedSide, true)
  assert.deepEqual(r.explicitSideViolationIds, [])
})
test('both side words in a generated query remain explicitly flagged as ambiguous', () => {
  const r = classifyQuery(left, 'left Right Structure', payload([]), byId)
  assert.equal(r.queryHasBothSides, true)
  assert.equal(r.explicitQuerySide, null)
  assert.equal(r.outcome, 'unmatched')
})
test('laterality can be recovered from catalog when payload omits it', () => {
  assert.equal(classifyQuery(left, 'left Structure', payload([{ ...right, side: undefined }]), byId).outcome, 'explicit_wrong_side')
})
