#!/usr/bin/env node
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, stat, rename } from 'node:fs/promises'
import crypto from 'node:crypto'
import { safeChild, recordKey } from './core.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const roots = {
  obsidian: option('--obsidian', '/Users/fabijanpitlovic/Documents/anatomed-obsidian'),
  mcp: option('--mcp', '/Users/fabijanpitlovic/Documents/anatomed-mcp'),
}
const output = option('--output', '/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/render')
const assets = Object.fromEntries(Object.entries(roots).map(([k, v]) => [k, option(`--${k}-assets`, path.join(v, 'assets'))]))
const require = createRequire(path.join(roots.obsidian, 'package.json'))
const { build } = require('esbuild')
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex')
const hashFile = async (file) => {
  const h = crypto.createHash('sha256')
  for await (const chunk of createReadStream(file)) h.update(chunk)
  return h.digest('hex')
}
await mkdir(path.join(output, 'bundles'), { recursive: true })
const manifests = {}
for (const [repo, root] of Object.entries(roots)) {
  const viewer = path.join(root, 'widget/RegionViewer.tsx')
  const catalogText = await readFile(path.join(root, 'assets/parts-catalog.json'), 'utf8')
  const catalog = JSON.parse(catalogText)
  await writeFile(path.join(output, 'bundles', `${repo}-catalog.json`), catalogText)
  const assetRecords = []
  for (const system of catalog.systems) {
    const file = path.join(assets[repo], 'glb', `${system.id}.glb`)
    try { assetRecords.push({ system: system.id, file, bytes: (await stat(file)).size, sha256: await hashFile(file) }) }
    catch (error) { assetRecords.push({ system: system.id, file, error: String(error) }) }
  }
  let instrumentations = 0
  const result = await build({
    entryPoints: [path.join(here, 'runner.tsx')], bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic',
    absWorkingDir: root, nodePaths: [path.join(root, 'node_modules')],
    define: { AUDIT_REPO: JSON.stringify(repo), 'process.env.NODE_ENV': '"production"' },
    alias: { ...Object.fromEntries(['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'].map(name => [name, path.join(root, 'node_modules', name)])), '@audit/viewer': viewer, '@audit/region': path.join(root, 'src/region.ts'), '@audit/resolver': path.join(root, 'src/vendor/resolveParts.ts') },
    plugins: [{ name: 'observer-only', setup(b) {
      b.onLoad({ filter: /RegionViewer\.tsx$/ }, async (a) => {
        if (a.path !== viewer) return
        const source = await readFile(a.path, 'utf8')
        const marker = '<ambientLight intensity={0.75} />'
        if (source.split(marker).length !== 2) throw new Error('Viewer changed: observer injection marker is not unique')
        instrumentations++
        return { contents: `import { AuditProbe } from ${JSON.stringify(path.join(here, 'probe.tsx'))};\n` + source.replace(marker, `<AuditProbe />${marker}`), loader: 'tsx', resolveDir: path.dirname(a.path) }
      })
    } }], metafile: true,
  })
  if (instrumentations !== 1) throw new Error(`Did not instrument exactly one actual ${repo} viewer`)
  const bundle = result.outputFiles[0].contents
  await writeFile(path.join(output, 'bundles', `${repo}.js`), bundle)
  const sources = {}
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = path.resolve(root, input)
    if (!file.includes('/node_modules/')) sources[file] = await hashFile(file)
  }
  manifests[repo] = { repo, root, assetRoot: assets[repo], generatedAt: new Date().toISOString(), catalogSha256: sha(catalogText), catalogParts: catalog.parts.length, bundleSha256: sha(bundle), sources, assets: assetRecords, instrumentation: 'Actual RegionViewer plus read-only R3F observer child. GLTFLoader.load callback observed, not replaced by helper rendering.' }
  await writeFile(path.join(output, `${repo}-manifest.json`), JSON.stringify(manifests[repo], null, 2))
}
if (args.includes('--build-only')) {
  console.log(JSON.stringify({ output, manifests }, null, 2))
  process.exit(0)
}
const html = (repo) => `<!doctype html><meta charset="utf-8"><title>${repo} actual viewer audit</title><style>html,body{margin:0;background:#222;color:#ddd;font:13px monospace}#root,.am-viewport{width:512px;height:512px}.am-stage{position:relative;width:512px;height:512px}.am-canvas{width:100%;height:100%}.am-legend{display:none}.am-loading,.am-recenter,.am-tooltip,.am-unmatched{position:absolute;top:0}#status{position:absolute;left:530px;top:10px;white-space:pre-wrap}</style><div id="root"></div><pre id="status">Loading audit API...</pre><script type="module" src="/bundle/${repo}.js"></script>`
async function body(req) {
  let bytes = 0
  const chunks = []
  for await (const c of req) {
    bytes += c.length
    if (bytes > 32 * 1024 * 1024) throw new Error('Request exceeds 32MB')
    chunks.push(c)
  }
  return JSON.parse(Buffer.concat(chunks).toString())
}
async function atomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomUUID()}.tmp`
  await writeFile(tmp, data)
  await rename(tmp, file)
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    const segments = decodeURIComponent(url.pathname).split('/').filter(Boolean)
    const json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
    if (req.method === 'POST') {
      // Same-origin browser only. Reject unsolicited cross-origin writes to the local machine.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new Error('Cross-origin write refused')
      const [api, repo, type] = segments
      if (api !== 'api' || !roots[repo] || !['part', 'summary', 'inventory', 'contact'].includes(type)) throw new Error('Invalid artifact endpoint')
      const data = await body(req)
      const run = String(data.run ?? '')
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(run)) throw new Error('Invalid run ID')
      const dir = path.join(output, repo, run)
      if (type === 'part') {
        if (!['catalog', 'synthetic-export'].includes(data.kind) || typeof data.id !== 'string' || typeof data.system !== 'string') throw new Error('Invalid part identity')
        const key = recordKey(data.kind, data.system, data.id, data.index)
        const images = data.images ?? []
        data.screenshots = []
        for (let i = 0; i < images.length; i++) {
          if (i > 3 || !/^data:image\/png;base64,/.test(images[i])) throw new Error('Expected up to four PNG images')
          const name = `${key}-view-${i}.png`
          await atomic(path.join(dir, name), Buffer.from(images[i].split(',')[1], 'base64'))
          data.screenshots.push(name)
        }
        delete data.images
        await atomic(path.join(dir, `${key}.json`), JSON.stringify(data, null, 2))
        return json({ key, screenshots: data.screenshots })
      }
      const suffix = String(data.system ?? 'all')
      if (!/^[a-zA-Z0-9_-]+$/.test(suffix)) throw new Error('Invalid system')
      if (type === 'contact') {
        if (!/^data:image\/png;base64,/.test(data.image)) throw new Error('Expected PNG contact sheet')
        const name = `contact-${suffix}-${Number(data.page) || 0}.png`
        await atomic(path.join(dir, name), Buffer.from(data.image.split(',')[1], 'base64'))
        return json({ name })
      }
      await atomic(path.join(dir, `${type}-${suffix}.json`), JSON.stringify(data, null, 2))
      return json({ saved: true })
    }
    if (req.method !== 'GET') throw new Error('Only GET and POST supported')
    if (segments.length === 0) return res.end('<a href="/obsidian/">Obsidian audit</a> <a href="/mcp/">MCP audit</a>')
    if (roots[segments[0]] && segments.length === 1) { res.setHeader('Content-Type', 'text/html'); return res.end(html(segments[0])) }
    if (segments[0] === 'manifest' && roots[segments[1]]) return json(manifests[segments[1]])
    let file
    if (segments[0] === 'bundle' && /^(mcp|obsidian)\.js$/.test(segments[1] ?? '')) file = path.join(output, 'bundles', segments[1])
    else if (segments[0] === 'assets' && roots[segments[1]]) {
      const repo = segments[1]
      const relative = segments.slice(2).join('/')
      file = relative === 'parts-catalog.json' ? path.join(output, 'bundles', `${repo}-catalog.json`) : safeChild(assets[repo], relative)
      if (!/\.(glb|json)$/.test(file)) throw new Error('Asset extension not allowed')
    } else throw new Error('Route not found')
    const size = (await stat(file)).size
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'model/gltf-binary')
    res.setHeader('Content-Length', size)
    res.setHeader('Cache-Control', 'no-store')
    createReadStream(file).pipe(res)
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: String(error) })) }
})
server.listen(Number(option('--port', '8766')), '127.0.0.1', () => console.log(`Audit ready: http://127.0.0.1:${server.address().port}/ | artifacts: ${output}`))
