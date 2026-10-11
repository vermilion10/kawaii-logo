import type { Contour } from './geometry'
import type { Box, Mask } from './types'

/**
 * The region that gets the second color. For the generated kinds it is everything on one
 * side of a curve that crosses the lettering; freehand masks are drawn in logo coordinates.
 */
export function maskContour(mask: Mask, box: Box): Contour | null {
  if (mask.kind === 'none') return null
  if (mask.kind === 'freehand') return mask.points.length > 2 ? mask.points : null

  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const a = (mask.angle * Math.PI) / 180
  const dir: [number, number] = [Math.cos(a), Math.sin(a)]
  const nrm: [number, number] = [-Math.sin(a), Math.cos(a)]
  const half = Math.abs((box.w / 2) * nrm[0]) + Math.abs((box.h / 2) * nrm[1])
  const base = (mask.position * 2 - 1) * half
  const reach = Math.hypot(box.w, box.h)
  const lambda = Math.max(8, mask.wavelength)

  const curve = (u: number): number => {
    const t = u / lambda + mask.phase
    if (mask.kind === 'wave') return mask.amplitude * Math.sin(2 * Math.PI * t)
    if (mask.kind === 'zigzag') return mask.amplitude * (4 * Math.abs(t - Math.floor(t + 0.5)) - 1)
    return 0
  }

  const at = (u: number, v: number): [number, number] => [cx + u * dir[0] + v * nrm[0], cy + u * dir[1] + v * nrm[1]]
  const pts: Contour = []
  const step = mask.kind === 'zigzag' ? lambda / 2 : 3
  // Zigzag samples land on the corners so the points stay sharp.
  const start = mask.kind === 'zigzag' ? Math.floor((-reach / lambda + mask.phase) * 2) / 2 : -reach / lambda
  for (let u = mask.kind === 'zigzag' ? (start - mask.phase) * lambda : -reach; u <= reach + step; u += step)
    pts.push(at(u, base + curve(u)))
  const far = mask.invert ? -reach * 2 : reach * 2
  const last = pts[pts.length - 1]
  const first = pts[0]
  const lastU = (last[0] - cx) * dir[0] + (last[1] - cy) * dir[1]
  const firstU = (first[0] - cx) * dir[0] + (first[1] - cy) * dir[1]
  pts.push(at(lastU, far), at(firstU, far))
  return pts
}
