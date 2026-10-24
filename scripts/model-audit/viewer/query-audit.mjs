#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const sideOf = text => {
  const left = /\bleft\b/i.test(text), right = /\bright\b/i.test(text)
  return left === right ? null : left ? 'l' : 'r'
}

export function displayId(id, cleanName) {
  // Query normalization only. Never apply this to expected/requested identity.
  return cleanName(cleanName(id).replace(/\.[lr]$/i, ''))
}

export function queriesFor(part, cleanName) {
  const rows = [
    { variant: 'name_en', query: part.name_en },
    { variant: 'cleaned_id_display', query: displayId(part.id, cleanName) },
  ]
  if (part.side === 'l' || part.side === 'r') rows.push({ variant: 'side_prefixed_display', query: `${part.side === 'l' ? 'left' : 'right'} ${cleanName(part.name_en)}` })
  return rows.map(row => ({ ...row, expectedId: part.id, expectedSide: part.side ?? null, explicitQuerySide: sideOf(row.query) }))
}

export function classifyQuery(expected, query, payload, catalogById, ambiguityIds = []) {
  const returned = payload.parts.filter(p => !p.context)
  const returnedIds = returned.map(p => p.id)
  const containsExpectedId = returnedIds.includes(expected.id)
  const requestedSide = sideOf(query)
  const expectedSide = expected.side ?? null
  const queryConflictsExpectedSide = !!requestedSide && !!expectedSide && requestedSide !== expectedSide
  const queryHasBothSides = /\bleft\b/i.test(query) && /\bright\b/i.test(query)
  const returnedSide = p => p.side ?? catalogById.get(p.id)?.side ?? sideOf(p.name_en ?? catalogById.get(p.id)?.name_en ?? p.id)
  const explicitSideViolationIds = requestedSide ? returned.filter(p => returnedSide(p) && returnedSide(p) !== requestedSide).map(p => p.id) : []
  const oppositeSideIds = expectedSide ? returned.filter(p => {
    const side = returnedSide(p)
    return side && side !== expectedSide
  }).map(p => p.id) : []
  const counterpartIds = oppositeSideIds.filter(id => {
    const p = catalogById.get(id)
    return p?.system === expected.system && p?.name_en.toLowerCase() === expected.name_en.toLowerCase()
  })
  const issues = payload.issues ?? []
  let outcome
  if (containsExpectedId) outcome = returnedIds.length === 1 ? 'contains_expected_singleton' : 'contains_expected_expansion'
  else if (issues.some(i => i.kind === 'ambiguous')) outcome = 'ambiguous_decline'
  else if (issues.some(i => i.kind === 'unavailable')) outcome = 'unavailable_decline'
  else if (!returnedIds.length) outcome = 'unmatched'
  else if (queryConflictsExpectedSide) outcome = 'query_catalog_side_conflict'
  else if (explicitSideViolationIds.length) outcome = 'explicit_wrong_side'
  else if (!requestedSide && counterpartIds.length) outcome = 'default_opposite_side_counterpart'
  else if (!requestedSide && oppositeSideIds.length) outcome = 'unspecified_side_other_structure'
  else if (returnedIds.some(id => ambiguityIds.includes(id))) outcome = 'ambiguous_name_other_catalog_row'
  else outcome = 'other_id_mismatch'
  return {
    outcome, containsExpectedId, exactSingleton: containsExpectedId && returnedIds.length === 1,
    returnedIds, returnedParts: returned.map(p => ({ id: p.id, side: returnedSide(p), system: p.system })),
    expectedSide, explicitQuerySide: requestedSide, queryConflictsExpectedSide, queryHasBothSides, explicitSideViolationIds, oppositeSideIds, counterpartIds,
    ambiguityIds, queryIsCatalogAmbiguous: ambiguityIds.length > 1,
    issues, unmatched: payload.unmatched, expanded: payload.expanded ?? [],
    interpretation: outcome === 'query_catalog_side_conflict' ? 'Display query explicitly names a side contrary to the expected catalog row metadata. This is a catalog/label conflict, not a demonstrated wrong-side resolver response.' : outcome === 'ambiguous_decline' ? 'Explicit ambiguity refusal, not automatically a defect.' : outcome === 'default_opposite_side_counterpart' ? 'Query omitted side, resolver selected the opposite-side counterpart. Not automatically a defect.' : outcome === 'explicit_wrong_side' ? 'Explicit side request returned opposite-side content without the expected ID. Review as a likely side-handling defect.' : 'Exact expected catalog-row coverage evidence, not an automatic semantic-correctness verdict.',
  }
}

function tally(rows) {
  const outcomes = {}, variants = {}
  for (const row of rows) {
    outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1
    const bucket = variants[row.variant] ??= { total: 0, containsExpected: 0, outcomes: {} }
    bucket.total++
    if (row.containsExpectedId) bucket.containsExpected++
    bucket.outcomes[row.outcome] = (bucket.outcomes[row.outcome] ?? 0) + 1
  }
  return { total: rows.length, containsExpected: rows.filter(r => r.containsExpectedId).length, outcomes, variants }
}

export async function auditHost(host, root, output, esbuild) {
  const catalogText = await readFile(path.join(root, 'assets/parts-catalog.json'), 'utf8')
  const rawCatalog = JSON.parse(catalogText)
  const catalog = { ...rawCatalog, parts: rawCatalog.parts.filter(p => !p.id.endsWith('.g')) }
  const regionFile = path.join(root, 'src/region.ts')
  const bundled = await esbuild.build({ stdin: { contents: `export { buildRegion, cleanName } from ${JSON.stringify(regionFile)}`, resolveDir: root, sourcefile: 'query-audit-entry.ts', loader: 'ts' }, absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', metafile: true })
  const module = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
  const sources = {}
  for (const input of Object.keys(bundled.metafile.inputs)) {
    if (input === 'query-audit-entry.ts') continue
    const file = path.resolve(root, input)
    sources[file] = hash(await readFile(file))
  }
  const byId = new Map(catalog.parts.map(p => [p.id, p]))
  const termIndex = new Map()
  for (const part of catalog.parts) {
    const terms = new Set([part.name_en, module.cleanName(part.name_en), displayId(part.id, module.cleanName), part.name_lat].filter(Boolean).map(s => s.toLowerCase()))
    for (const term of terms) {
      const bucket = termIndex.get(term) ?? []
      bucket.push(part.id)
      termIndex.set(term, bucket)
    }
  }
  const rows = []
  const base = 'http://audit.invalid/assets' // buildRegion is pure and performs no network request.
  for (const [index, part] of catalog.parts.entries()) for (const item of queriesFor(part, module.cleanName)) {
    const evidence = { selectableIndex: index, expectedId: part.id, expectedSystem: part.system, expectedName: part.name_en, ...item }
    try {
      const { payload } = module.buildRegion(catalog, [item.query], base, { detail: 'isolated' })
      rows.push({ ...evidence, ...classifyQuery(part, item.query, payload, byId, termIndex.get(item.query.toLowerCase()) ?? []) })
    } catch (error) { rows.push({ ...evidence, outcome: 'runtime_error', containsExpectedId: false, error: String(error) }) }
  }
  const systemQueries = ['organs', 'nervous system', 'vascular system'].map(query => {
    try {
      const { payload } = module.buildRegion(catalog, [query], base, { detail: 'isolated' })
      return { query, outcome: payload.issues?.length ? 'declined' : payload.parts.length ? 'resolved' : 'unmatched', returnedIds: payload.parts.map(p => p.id), issues: payload.issues ?? [], unmatched: payload.unmatched, expanded: payload.expanded ?? [], expectedId: null, note: 'Broad-system probe, no singleton catalog ID expected. Unmatched is not automatically a defect under bounded-region product policy.' }
    } catch (error) { return { query, outcome: 'runtime_error', error: String(error) } }
  })
  const summary = { host, selectableRows: catalog.parts.length, excludedGroupRows: rawCatalog.parts.length - catalog.parts.length, ...tally(rows), systemQueries }
  const result = { generatedAt: new Date().toISOString(), host, root, catalogSha256: hash(catalogText), sourceHashes: sources, implementation: 'Actual repository buildRegion bundled in memory, no server rebuild or bundle/artifact modification.', normalization: { name_en: 'Verbatim catalog name_en', cleaned_id_display: 'Actual cleanName, remove terminal .l/.r, actual cleanName again. Expected IDs never normalized.', side_prefixed_display: 'left/right plus actual cleanName(name_en), only when catalog side is l/r' }, interpretation: 'Per-row coverage is not a defect count. Unqualified names may legitimately choose a default side, expand groups, select a duplicate-name row, or explicitly decline ambiguity. Semantic correctness requires review.', summary, rows }
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, `query-audit-${host}.json`), JSON.stringify(result, null, 2))
  await writeFile(path.join(output, `query-audit-${host}-summary.json`), JSON.stringify(summary, null, 2))
  return summary
}

async function main() {
  const args = process.argv.slice(2)
  const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
  const output = option('--output', '/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/render')
  const roots = { obsidian: option('--obsidian', '/Users/fabijanpitlovic/Documents/anatomed-obsidian'), mcp: option('--mcp', '/Users/fabijanpitlovic/Documents/anatomed-mcp') }
  const esbuild = createRequire(path.join(roots.obsidian, 'package.json'))('esbuild')
  for (const [host, root] of Object.entries(roots)) console.log(JSON.stringify(await auditHost(host, root, output, esbuild)))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
