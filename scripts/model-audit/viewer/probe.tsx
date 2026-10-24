import { useFrame, useThree } from '@react-three/fiber'

export const observed: { state: any, frames: number } = { state: null, frames: 0 }

/** Observer only: does not modify rendering, visibility, materials, camera, or timing. */
export function AuditProbe() {
  const state = useThree()
  useFrame(() => {
    observed.state = state
    observed.frames++
  })
  return null
}
