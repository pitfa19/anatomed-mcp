import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import RegionViewer from '@audit/viewer'
import { assembleRegion, buildRegion } from '@audit/region'
import { resolveQueryToParts } from '@audit/resolver'
import { observed } from './probe'
import { pixelEvidence, structuralFailures } from './evidence.mjs'
import { isMountedSystemReady } from './readiness.mjs'

declare const AUDIT_REPO: string
const repo = AUDIT_REPO
const assetBase = `${location.origin}/assets/${repo}`
const catalog = await (await fetch(`${assetBase}/parts-catalog.json`)).json()
const manifest = await (await fetch(`/manifest/${repo}`)).json()
const decoded = new Map<string, any>()
const loadErrors = new Map<string, string>()
const loadCounts = new Map<string, number>()
const runtimeErrors: { time: number, message: string }[] = []
const originalLoad = GLTFLoader.prototype.load
// Observe the loader the actual SystemGroup invokes. No independent decode or helper scene.
GLTFLoader.prototype.load = function(url: string, onLoad: any, progress: any, onError: any) {
  loadCounts.set(url, (loadCounts.get(url) ?? 0) + 1)
  return originalLoad.call(this, url, (gltf: any) => { decoded.set(url, gltf); onLoad(gltf) }, progress, (error: any) => {
    loadErrors.set(url, String(error?.message ?? error))
    onError?.(error)
  })
}
window.addEventListener('error', e => runtimeErrors.push({ time: performance.now(), message: e.message }))
window.addEventListener('unhandledrejection', e => runtimeErrors.push({ time: performance.now(), message: String(e.reason) }))
const originalError = console.error
console.error = (...args) => {
  runtimeErrors.push({ time: performance.now(), message: args.map(String).join(' ') })
  originalError(...args)
}
let boundaryFailure: string | null = null
class Boundary extends React.Component<any, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: any) { return { error: String(error) } }
  componentDidCatch(error: any) { boundaryFailure = String(error); runtimeErrors.push({ time: performance.now(), message: String(error) }) }
  render() { return this.state.error ? <pre>{this.state.error}</pre> : this.props.children }
}
let root = createRoot(document.getElementById('root')!)
let busy = false, stopRequested = false
let progress: any = { ready: true, repo, running: false }
function status(value: any) {
  progress = { ...progress, ...value }
  document.getElementById('status')!.textContent = JSON.stringify(progress, null, 2)
}
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
async function until(predicate: () => boolean, timeout: number, label: string) {
  const started = performance.now()
  while (!predicate()) {
    if (performance.now() - started > timeout) throw new Error(`Timed out: ${label}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
async function post(type: string, value: any) {
  const response = await fetch(`/api/${repo}/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  if (!response.ok) throw new Error(`Persistence failed (${response.status}): ${await response.text()}`)
  return response.json()
}
function meshes(scene: any) {
  const out: any[] = []
  scene?.traverse((o: any) => { if (o.isMesh) out.push(o) })
  return out
}
function effectiveVisible(o: any): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false
  return true
}
function materials(scene: any) {
  return new Set(meshes(scene).flatMap(m => Array.isArray(m.material) ? m.material : [m.material]))
}
function retireMaterials(previous: Set<any>, scene: any, source: any) {
  const keep = new Set([...materials(scene), ...materials(source)])
  for (const material of previous) if (!keep.has(material)) material?.dispose()
}
const geometryCache = new WeakMap<any, any>()
function geometryEvidence(node: any) {
  const result = { meshes: 0, vertices: 0, triangles: 0, nonfinite: 0, degenerateTriangles: 0 }
  for (const mesh of meshes(node)) {
    const geometry = mesh.geometry
    let stats = geometryCache.get(geometry)
    if (!stats) {
      const position = geometry?.attributes?.position
      stats = { vertices: position?.count ?? 0, triangles: Math.floor((geometry?.index?.count ?? position?.count ?? 0) / 3), nonfinite: 0, degenerateTriangles: 0 }
      if (position) {
        for (let i = 0; i < position.count; i++) if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) stats.nonfinite++
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
        for (let i = 0; i < stats.triangles * 3; i += 3) {
          a.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i) : i)
          b.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i + 1) : i + 1)
          c.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i + 2) : i + 2)
          if (b.sub(a).cross(c.sub(a)).lengthSq() === 0) stats.degenerateTriangles++
        }
      }
      geometryCache.set(geometry, stats)
    }
    result.meshes++
    for (const key of ['vertices', 'triangles', 'nonfinite', 'degenerateTriangles'] as const) result[key] += stats[key]
  }
  return result
}
async function exportedInventory(gltf: any, system: string) {
  const entries: any[] = []
  const catalogNames = new Set(catalog.parts.filter((p: any) => p.system === system).map((p: any) => THREE.PropertyBinding.sanitizeNodeName(p.id)))
  const byIndex = new Map<number, any[]>()
  gltf.scene.traverse((o: any) => {
    const index = gltf.parser.associations.get(o)?.nodes
    if (index !== undefined) byIndex.set(index, [...(byIndex.get(index) ?? []), o])
  })
  // Every exported JSON node is inventoried, including inactive scene nodes and empty groups.
  for (const [index, node] of (gltf.parser.json.nodes ?? []).entries()) {
    const activeObjects = byIndex.get(index) ?? []
    // Use this actual loader's dependency cache for inactive nodes too, never guess sanitized names.
    const objects = activeObjects.length ? activeObjects : [await gltf.parser.getDependency('node', index)]
    entries.push({ index, rawName: node.name ?? null, loaderNames: objects.map(o => o.name), activeScene: activeObjects.length > 0, geometries: objects.map(geometryEvidence), catalogMatches: objects.flatMap(o => catalogNames.has(o.name) ? [o.name] : []) })
  }
  const synthetic: any[] = []
  // Include every loader-associated uncatalogued exported node, not mesh primitive aliases.
  for (const entry of entries) for (const name of entry.loaderNames) {
    if (!catalogNames.has(name)) synthetic.push({ id: name, name_en: entry.rawName ?? name, name_lat: '', system, kind: 'synthetic-export', index: entry.index, rawName: entry.rawName })
  }
  return { entries, synthetic, unrenderableExportedNodes: entries.filter(e => !e.activeScene) }
}
function readPixels(renderer: any) {
  const gl = renderer.getContext()
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight
  const bytes = new Uint8Array(width * height * 4)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
  if (gl.isContextLost()) throw new Error('WebGL context lost')
  const error = gl.getError()
  if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error}`)
  return { bytes, width, height }
}
function captureView(label: string, state: any, visibleMeshes: any[]) {
  const { gl, scene, camera } = state
  gl.render(scene, camera)
  const actual = readPixels(gl)
  const image = gl.domElement.toDataURL('image/png')
  // Differential baseline measures model pixels only, never DOM overlays or legend text.
  for (const mesh of visibleMeshes) mesh.visible = false
  let baseline
  try { gl.render(scene, camera); baseline = readPixels(gl) }
  finally { for (const mesh of visibleMeshes) mesh.visible = true; gl.render(scene, camera) }
  return { label, pixels: pixelEvidence(actual.bytes, baseline.bytes, actual.width, actual.height), camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), near: camera.near, far: camera.far, left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, zoom: camera.zoom }, image }
}
function captureViews(state: any, count: number) {
  const { camera, controls, scene } = state
  const visibleMeshes = meshes(scene).filter(effectiveVisible)
  const saved = camera.clone()
  const controlsEnabled = controls?.enabled
  if (controls) controls.enabled = false
  const result = []
  try {
    result.push(captureView('actual-default', state, visibleMeshes))
    const target = controls?.target?.clone() ?? new THREE.Vector3()
    const offset = camera.position.clone().sub(target)
    // Additional viewpoints rotate the actual camera without substituting the viewer's fit logic.
    for (let i = 1; i < count; i++) {
      const axis = i === 1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      camera.position.copy(target).add(offset.clone().applyAxisAngle(axis, Math.PI / 2))
      camera.up.set(0, 1, 0)
      if (i === 2) camera.up.set(0, 0, -1)
      camera.lookAt(target)
      camera.updateMatrixWorld(true)
      result.push(captureView(i === 1 ? 'quarter-turn-y' : 'quarter-turn-x', state, visibleMeshes))
    }
  } finally {
    camera.copy(saved)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    if (controls) controls.enabled = controlsEnabled
    state.gl.render(scene, camera)
  }
  return result
}
function resolverEvidence(id: string) {
  try {
    const resolved = resolveQueryToParts(catalog, id)
    const normal = buildRegion(catalog, [id], assetBase, { detail: 'isolated' }).payload
    return { query: id, ids: resolved?.parts.map((p: any) => p.id) ?? [], issue: resolved?.issue ?? null, payloadIds: normal.parts.map((p: any) => p.id), unmatched: normal.unmatched, exactSingleton: normal.parts.length === 1 && normal.parts[0].id === id }
  } catch (error) { return { error: String(error), exactSingleton: false } }
}
let lastIdentity: string | null = null
async function renderPart(part: any, options: any, run: string, systemKey: string) {
  const started = performance.now()
  const url = `${assetBase}/glb/${part.system}.glb`
  const record: any = { repo, run, bundleSha256: manifest.bundleSha256, kind: part.kind, system: part.system, id: part.id, index: part.index, rawName: part.rawName, startedAt: new Date().toISOString(), status: 'error', renderAttempted: true, errors: [], views: [], images: [] }
  const previous = materials(observed.state?.scene)
  const previousChildren = observed.state?.scene.children.map((o: any) => o.uuid).join('|')
  // Separate normal resolver coverage. Rendering uses exact payload even if resolver declines an ID.
  record.resolver = resolverEvidence(part.id)
  const identity = `${part.system}/${part.id}`
  const samePartition = lastIdentity === identity
  lastIdentity = identity
  const payload = assembleRegion(catalog, [part], assetBase, { detail: 'isolated', title: part.id })
  record.payload = payload
  try {
    flushSync(() => root.render(<Boundary key={systemKey}><RegionViewer payload={payload} /></Boundary>))
    await until(() => !!boundaryFailure || !!loadErrors.get(url) || isMountedSystemReady({
      decoded: decoded.has(url), scene: observed.state?.scene,
      loading: !!document.querySelector('#root .am-loading'), previousChildren, samePartition,
    }), options.timeoutMs, 'actual system meshes mounted, loading overlay cleared, and new viewer clone')
    if (boundaryFailure) throw new Error(boundaryFailure)
    if (loadErrors.has(url)) throw new Error(loadErrors.get(url))
    const firstFrame = observed.frames
    await until(() => observed.frames >= firstFrame + options.settleFrames, options.timeoutMs, 'viewer fit frames')
    const { scene } = observed.state
    const targetName = THREE.PropertyBinding.sanitizeNodeName(part.id)
    const matches: any[] = []
    scene.traverse((o: any) => { if (o.name === targetName) matches.push(o) })
    const target = matches[0]
    record.sanitizedId = targetName
    record.nodeMatches = matches.length
    record.matchedNames = matches.map(o => o.name)
    record.geometry = target ? geometryEvidence(target) : null
    const expected = new Set(target ? meshes(target) : [])
    const visible = meshes(scene).filter(effectiveVisible)
    record.visibleMeshes = visible.filter(m => expected.has(m)).map(m => m.name)
    record.unexpectedVisible = visible.filter(m => !expected.has(m)).map(m => m.name)
    record.hiddenTargetMeshes = [...expected].filter(m => !effectiveVisible(m)).map(m => m.name)
    record.hiddenRenderableTargetMeshes = record.hiddenTargetMeshes.filter((name: string) => !name.includes('-lin') && !name.includes('labels'))
    if (target) {
      const box = new THREE.Box3().setFromObject(target)
      record.worldBounds = { min: box.min.toArray(), max: box.max.toArray(), empty: box.isEmpty() }
    }
    const views = captureViews(observed.state, options.viewpoints)
    record.images = views.map(v => v.image)
    record.views = views.map(({ image, ...v }) => v)
    record.renderer = { memory: { ...observed.state.gl.info.memory }, render: { ...observed.state.gl.info.render }, loadCount: loadCounts.get(url) }
    record.errors = runtimeErrors.filter(e => e.time >= started).map(e => e.message)
    record.failures = structuralFailures(record)
    if (record.geometry && record.geometry.triangles === record.geometry.degenerateTriangles) record.failures.push('all-triangles-degenerate')
    record.status = record.failures.length ? 'fail' : 'pass-structural'
    retireMaterials(previous, scene, decoded.get(url)?.scene)
  } catch (error) {
    record.errors = [...runtimeErrors.filter(e => e.time >= started).map(e => e.message), String(error)]
    record.status = 'error'
  }
  record.durationMs = performance.now() - started
  return record
}
function makeContact() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 1024
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#242424'; ctx.fillRect(0, 0, 1024, 1024)
  return { canvas, ctx, count: 0, page: 0 }
}
async function contactAdd(contact: any, record: any, run: string, system: string) {
  const x = (contact.count % 8) * 128, y = Math.floor(contact.count / 8) * 128
  if (record.images[0]) {
    const image = new Image()
    image.src = record.images[0]
    await image.decode()
    contact.ctx.drawImage(image, x, y, 128, 104)
  }
  contact.ctx.fillStyle = record.status === 'pass-structural' ? '#99ee99' : '#ff9999'
  contact.ctx.font = '9px monospace'
  contact.ctx.fillText(`${record.kind === 'catalog' ? 'C' : 'S'} ${record.index}: ${record.id}`, x + 2, y + 114, 124)
  contact.ctx.fillText(record.status, x + 2, y + 125, 124)
  contact.count++
  if (contact.count === 64) await contactFlush(contact, run, system)
}
async function contactFlush(contact: any, run: string, system: string) {
  if (!contact.count) return
  await post('contact', { run, system, page: contact.page++, image: contact.canvas.toDataURL('image/png') })
  contact.ctx.fillStyle = '#242424'; contact.ctx.fillRect(0, 0, 1024, 1024)
  contact.count = 0
}
async function disposeSystem(system: string) {
  const url = `${assetBase}/glb/${system}.glb`
  const state = observed.state
  const allMaterials = new Set([...materials(state?.scene), ...materials(decoded.get(url)?.scene)])
  flushSync(() => root.render(null))
  await tick()
  for (const material of allMaterials) {
    for (const value of Object.values(material ?? {})) if ((value as any)?.isTexture) (value as any).dispose()
    material?.dispose()
  }
  for (const mesh of meshes(decoded.get(url)?.scene)) mesh.geometry?.dispose()
  useLoader.clear(GLTFLoader, url)
  decoded.delete(url)
  loadErrors.delete(url)
  lastIdentity = null
  boundaryFailure = null
  state?.gl.renderLists.dispose()
  state?.gl.dispose()
  observed.state = null
}
function compact(record: any) {
  return { kind: record.kind, index: record.index, id: record.id, renderAttempted: record.renderAttempted, status: record.status, resolverExact: record.resolver?.exactSingleton ?? false, failures: record.failures, errors: record.errors }
}
async function run(input: any = {}) {
  if (busy) throw new Error('An audit is already running in this page')
  const options = { viewpoints: 3, settleFrames: 12, timeoutMs: 120000, includeSynthetic: true, ...input }
  if (![1, 2, 3].includes(options.viewpoints) || options.settleFrames < 10) throw new Error('Use 1..3 viewpoints and at least 10 settle frames')
  const selected = options.systems ?? catalog.systems.map((s: any) => s.id)
  for (const id of selected) if (!catalog.systems.some((s: any) => s.id === id)) throw new Error(`Unknown system ${id}`)
  const runId = options.runId ?? new Date().toISOString().replace(/[^0-9A-Za-z]/g, '')
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runId)) throw new Error('Invalid runId')
  busy = true; stopRequested = false
  const summary: any = { run: runId, repo, startedAt: new Date().toISOString(), options, selected, catalogTotal: catalog.parts.length, systems: [], complete: false, manifest, browser: { userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, viewport: [innerWidth, innerHeight] } }
  status({ runId, running: true, completed: 0, total: catalog.parts.length })
  try {
    for (const system of selected) {
      if (stopRequested) break
      const allParts = catalog.parts.map((p: any, index: number) => ({ ...p, index, kind: 'catalog' })).filter((p: any) => p.system === system)
      const selectedParts = options.ids ? allParts.filter((p: any) => options.ids.includes(p.id)) : allParts
      const rows: any[] = []
      const contact = makeContact()
      const sysSummary: any = { system, catalogExpected: allParts.length, selectedCatalog: selectedParts.length, syntheticExpected: null, records: rows, complete: false }
      summary.systems.push(sysSummary)
      let systemError: string | null = null
      try {
        // Mount a warmup actual viewer when an ID filter selects no catalog part.
        if (!selectedParts.length && allParts.length) await renderPart(allParts[0], options, runId, system)
        for (const part of selectedParts) {
          if (stopRequested) break
          let record
          if (systemError) record = { repo, run: runId, bundleSha256: manifest.bundleSha256, kind: part.kind, system, id: part.id, index: part.index, status: 'error', renderAttempted: false, errors: [systemError], images: [], resolver: resolverEvidence(part.id), payload: assembleRegion(catalog, [part], assetBase, { detail: 'isolated', title: part.id }) }
          else record = await renderPart(part, options, runId, system)
          if (record.status === 'error') systemError = record.errors.join('\n')
          if (loadErrors.has(`${assetBase}/glb/${system}.glb`)) systemError = loadErrors.get(`${assetBase}/glb/${system}.glb`)!
          await post('part', record)
          await contactAdd(contact, record, runId, system)
          rows.push(compact(record))
          status({ system, kind: 'catalog', id: part.id, completed: progress.completed + 1 })
        }
        const gltf = decoded.get(`${assetBase}/glb/${system}.glb`)
        if (gltf) {
          const inventory = await exportedInventory(gltf, system)
          await post('inventory', { run: runId, system, bundleSha256: manifest.bundleSha256, ...inventory })
          sysSummary.syntheticExpected = inventory.synthetic.length
          sysSummary.unrenderableExportedNodes = inventory.unrenderableExportedNodes
          if (options.includeSynthetic && !options.ids) for (const part of inventory.synthetic) {
            if (stopRequested) break
            const record = systemError ? { repo, run: runId, bundleSha256: manifest.bundleSha256, kind: part.kind, system, id: part.id, index: part.index, rawName: part.rawName, status: 'error', renderAttempted: false, errors: [systemError], images: [], resolver: resolverEvidence(part.id) } : await renderPart(part, options, runId, system)
            if (record.status === 'error') systemError = record.errors.join('\n')
            await post('part', record)
            await contactAdd(contact, record, runId, system)
            rows.push(compact(record))
            status({ system, kind: 'synthetic-export', id: part.id, completed: progress.completed + 1 })
          }
        } else sysSummary.inventoryError = systemError ?? 'GLTFLoader did not produce an active scene'
        sysSummary.complete = !systemError && !options.ids && rows.filter(r => r.kind === 'catalog').length === allParts.length && sysSummary.syntheticExpected !== null && options.includeSynthetic && rows.filter(r => r.kind === 'synthetic-export').length === sysSummary.syntheticExpected
      } finally {
        await contactFlush(contact, runId, system)
        sysSummary.counts = { passed: rows.filter(r => r.status === 'pass-structural').length, failed: rows.filter(r => r.status === 'fail').length, errors: rows.filter(r => r.status === 'error').length, resolverExact: rows.filter(r => r.kind === 'catalog' && r.resolverExact).length }
        await post('summary', { run: runId, system, ...sysSummary })
        await disposeSystem(system)
      }
    }
    summary.complete = !options.ids && !stopRequested && new Set(selected).size === catalog.systems.length && summary.systems.every((s: any) => s.complete)
    return summary
  } catch (error) {
    summary.fatalError = String(error)
    throw error
  } finally {
    summary.finishedAt = new Date().toISOString()
    summary.stopped = stopRequested
    busy = false
    status({ running: false, complete: summary.complete, fatalError: summary.fatalError })
    await post('summary', summary)
  }
}
;(window as any).audit = { run, status: () => ({ ...progress }), stop: () => { stopRequested = true }, catalog: () => catalog, manifest: () => manifest, version: 1 }
status({ ready: true, catalogParts: catalog.parts.length, systems: catalog.systems.map((s: any) => s.id), instruction: 'await window.audit.run() or run({systems:["skeleton"]})' })
