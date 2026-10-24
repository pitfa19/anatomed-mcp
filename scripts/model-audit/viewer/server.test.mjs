import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// This is server/bundle integration, not a browser render test.
test('both actual viewer bundles and artifact endpoints work without modifying production files', { timeout: 30000 }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'anatomed-audit-self-check-'))
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url)), '--port', '0', '--output', output, '--mcp-assets', '/Users/fabijanpitlovic/Documents/anatomed-obsidian/assets'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  let errors = ''
  child.stderr.on('data', c => { errors += c })
  try {
    const address = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${errors}`)), 20000)
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)) })
      child.stdout.on('data', c => {
        logs += c
        const m = logs.match(/http:\/\/127\.0\.0\.1:\d+/)
        if (m) { clearTimeout(timer); resolve(m[0]) }
      })
    })
    for (const repo of ['obsidian', 'mcp']) {
      const page = await (await fetch(`${address}/${repo}/`)).text()
      assert.ok(page.includes(`/bundle/${repo}.js`))
      const bundle = await (await fetch(`${address}/bundle/${repo}.js`)).text()
      assert.ok(bundle.includes('function RegionViewer('))
      assert.ok(bundle.includes('function SystemGroup('))
      assert.ok(bundle.includes('function AuditProbe('))
      const manifest = await (await fetch(`${address}/manifest/${repo}`)).json()
      assert.ok(manifest.sources[`/Users/fabijanpitlovic/Documents/anatomed-${repo}/widget/RegionViewer.tsx`])
      const catalogSystems = JSON.parse(await readFile(`/Users/fabijanpitlovic/Documents/anatomed-${repo}/assets/parts-catalog.json`, 'utf8')).systems.length
      assert.equal(manifest.assets.length, catalogSystems)
      assert.ok(manifest.assets.every(a => a.sha256))
      const catalog = await (await fetch(`${address}/assets/${repo}/parts-catalog.json`)).json()
      assert.equal(catalog.parts.length, manifest.catalogParts)
    }
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFZsAAAAASUVORK5CYII='
    const send = (value, headers = {}) => fetch(`${address}/api/obsidian/part`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) })
    const base = { run: 'endpoint-self-check', kind: 'catalog', system: 'skeleton', index: 1, status: 'fixture-only', images: [png] }
    const response = await send({ ...base, id: 'part.001' })
    assert.equal(response.status, 200)
    const artifact = await response.json()
    assert.equal(artifact.screenshots.length, 1)
    const saved = JSON.parse(await readFile(path.join(output, 'obsidian/endpoint-self-check', `${artifact.key}.json`), 'utf8'))
    assert.equal(saved.id, 'part.001')
    assert.equal(saved.images, undefined)
    const second = await (await send({ ...base, id: 'part.002' })).json()
    assert.notEqual(second.key, artifact.key)
    assert.equal((await readdir(path.join(output, 'obsidian/endpoint-self-check'))).length, 4)
    assert.equal((await send({ ...base, id: 'part', run: '../escape' })).status, 400)
    assert.equal((await send({ ...base, id: 'part' }, { Origin: 'https://untrusted.example' })).status, 400)
    assert.equal((await fetch(`${address}/assets/mcp/%2e%2e%2fpackage.json`)).status, 400)
    const reconciled = spawn(process.execPath, [fileURLToPath(new URL('./summarize.mjs', import.meta.url)), '--output', output, '--repo', 'obsidian', '--run', 'endpoint-self-check'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let coverageText = ''
    let coverageErrors = ''
    reconciled.stdout.on('data', c => { coverageText += c })
    reconciled.stderr.on('data', c => { coverageErrors += c })
    const code = await new Promise(resolve => reconciled.on('close', resolve))
    assert.equal(code, 2, coverageErrors)
    const coverage = JSON.parse(coverageText)
    assert.equal(coverage.coverageComplete, false)
    assert.equal(coverage.missingInventories.length, JSON.parse(await readFile('/Users/fabijanpitlovic/Documents/anatomed-obsidian/assets/parts-catalog.json', 'utf8')).systems.length)
    assert.equal(coverage.missing.length, coverage.counts.catalog.expected)
  } finally {
    child.kill('SIGTERM')
    await rm(output, { recursive: true, force: true })
  }
})
