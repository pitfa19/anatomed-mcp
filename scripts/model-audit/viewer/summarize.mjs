#!/usr/bin/env node
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { recordKey, safeChild } from './core.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const output = option('--output', '/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/render')
const repo = option('--repo', 'obsidian')
const run = option('--run', '')
if (!['obsidian', 'mcp'].includes(repo) || !/^[A-Za-z0-9_-]{1,100}$/.test(run)) throw new Error('Use --repo obsidian|mcp --run RUN_ID')
const dir = safeChild(output, `${repo}/${run}`)
const manifest = JSON.parse(await readFile(path.join(output, `${repo}-manifest.json`), 'utf8'))
const catalogText = await readFile(path.join(output, 'bundles', `${repo}-catalog.json`), 'utf8')
if (crypto.createHash('sha256').update(catalogText).digest('hex') !== manifest.catalogSha256) throw new Error('Catalog snapshot differs from manifest')
const catalog = JSON.parse(catalogText)
const files = await readdir(dir)
const records = new Map()
for (const file of files.filter(f => /^(catalog|synthetic-export)-.*\.json$/.test(f))) {
  const record = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
  records.set(file.slice(0, -5), record)
}
const expected = catalog.parts.map((p, index) => ({ ...p, kind: 'catalog', index }))
const missingInventories = []
for (const system of catalog.systems) {
  try {
    const inventory = JSON.parse(await readFile(path.join(dir, `inventory-${system.id}.json`), 'utf8'))
    if (inventory.bundleSha256 !== manifest.bundleSha256) throw new Error('Inventory from a different bundle')
    expected.push(...inventory.synthetic)
  } catch { missingInventories.push(system.id) }
}
const missing = [], unattempted = [], invalidArtifacts = []
const counts = { catalog: { expected: catalog.parts.length, records: 0, passed: 0, failed: 0, errors: 0, resolverExact: 0 }, synthetic: { expected: expected.length - catalog.parts.length, records: 0, passed: 0, failed: 0, errors: 0 } }
for (const item of expected) {
  const key = recordKey(item.kind, item.system, item.id, item.index)
  const record = records.get(key)
  const identity = { kind: item.kind, system: item.system, id: item.id, index: item.index }
  if (!record) { missing.push(identity); continue }
  if (record.bundleSha256 !== manifest.bundleSha256) invalidArtifacts.push({ ...identity, error: 'Record belongs to a different bundle' })
  const count = item.kind === 'catalog' ? counts.catalog : counts.synthetic
  count.records++
  if (record.status === 'pass-structural') count.passed++
  else if (record.status === 'fail') count.failed++
  else count.errors++
  if (item.kind === 'catalog' && record.resolver?.exactSingleton) count.resolverExact++
  if (!record.renderAttempted) unattempted.push(identity)
  for (const file of record.screenshots ?? []) {
    try { if ((await stat(safeChild(dir, file))).size < 8) throw new Error('empty PNG') }
    catch (error) { invalidArtifacts.push({ ...identity, file, error: String(error) }) }
  }
  if (record.status !== 'error' && (record.screenshots?.length !== record.views?.length || !record.screenshots?.length)) invalidArtifacts.push({ ...identity, error: 'Missing view screenshots' })
}
const report = { repo, run, counts, missingInventories, missing, unattempted, invalidArtifacts, coverageComplete: !missingInventories.length && !missing.length && !unattempted.length && !invalidArtifacts.length, note: 'Coverage complete is not correctness. Structural failures and resolver failures remain separate. Synthetic expected count is unknown for missing inventories.' }
await writeFile(path.join(dir, 'coverage.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.coverageComplete ? 0 : 2
