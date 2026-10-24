/** Readiness is about the system mount, never existence/visibility of the requested target. */
export function isMountedSystemReady({ decoded, scene, loading, previousChildren, samePartition }) {
  if (!decoded || !scene || loading) return false
  let mountedMesh = false
  scene.traverse(object => { if (object.isMesh) mountedMesh = true })
  if (!mountedMesh) return false
  return samePartition || scene.children.map(object => object.uuid).join('|') !== previousChildren
}
