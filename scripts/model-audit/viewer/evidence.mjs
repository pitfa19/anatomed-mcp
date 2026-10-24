// Pure evidence checks. A nonblank image alone can never produce a structural pass.
export function pixelEvidence(actual, baseline, width, height) {
  let changed = 0, opaque = 0, edge = 0
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let i = 0; i < actual.length; i += 4) {
    if (actual[i + 3] > 8) opaque++
    if (Math.abs(actual[i] - baseline[i]) <= 8 && Math.abs(actual[i + 1] - baseline[i + 1]) <= 8 && Math.abs(actual[i + 2] - baseline[i + 2]) <= 8 && Math.abs(actual[i + 3] - baseline[i + 3]) <= 8) continue
    changed++
    const p = i / 4, x = p % width, y = Math.floor(p / width)
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) edge++
  }
  return { width, height, changed, opaque, edge, fraction: changed / (width * height), bounds: changed ? [minX, minY, maxX, maxY] : null }
}

export function structuralFailures(record) {
  const failures = []
  if (record.nodeMatches !== 1) failures.push('missing-or-ambiguous-exact-node')
  if (!record.geometry?.vertices || !record.geometry?.triangles) failures.push('no-triangle-geometry')
  if (record.geometry?.nonfinite) failures.push('nonfinite-geometry')
  if (!record.visibleMeshes?.length) failures.push('no-visible-target-mesh')
  if (record.unexpectedVisible?.length) failures.push('isolation-leak')
  if (record.hiddenRenderableTargetMeshes?.length) failures.push('hidden-target-geometry')
  if (!record.views?.[0]?.pixels.changed) failures.push('blank-default-view')
  if (record.views?.some(v => v.pixels.edge > 0)) failures.push('possible-viewport-clipping')
  if (record.errors?.length) failures.push('runtime-errors')
  return failures
}
