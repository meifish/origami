import type { Mark, Point } from './project'

export const clamp = (value: number) => Math.max(0, Math.min(1, value))
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
})
export function defaultControl(a: Point, b: Point, width: number, height: number): Point {
  const mid = lerp(a, b, 0.5)
  const dx = (b.x - a.x) * width
  const dy = (b.y - a.y) * height
  const length = Math.hypot(dx, dy)
  if (length === 0) return mid

  const normal = { x: -dy / length, y: dx / length }
  const target = Math.min(length * 0.42, Math.min(width, height) * 0.38)
  const room = (direction: number) => {
    const nx = normal.x * direction
    const ny = normal.y * direction
    return Math.min(
      nx === 0 ? Infinity : (nx > 0 ? 1 - mid.x : mid.x) * width / Math.abs(nx),
      ny === 0 ? Infinity : (ny > 0 ? 1 - mid.y : mid.y) * height / Math.abs(ny),
    )
  }
  const preferred = room(1)
  const alternate = room(-1)
  const side = preferred < target && alternate > preferred ? -1 : 1
  const offset = Math.min(target, side === 1 ? preferred : alternate) * side
  return {
    x: clamp(mid.x + normal.x * offset / width),
    y: clamp(mid.y + normal.y * offset / height),
  }
}
export function curve(mark: Mark, width: number, height: number, progress: number) {
  const scale = (p: Point) => ({ x: p.x * width, y: p.y * height })
  const start = scale(mark.start)
  const end = scale(mark.end)
  const control = scale(mark.control)
  const partialControl = lerp(start, control, progress)
  const tip = lerp(partialControl, lerp(control, end, progress), progress)
  const tangent = Math.hypot(tip.x - partialControl.x, tip.y - partialControl.y) > 0.01 ? partialControl : start
  const angle = Math.atan2(tip.y - tangent.y, tip.x - tangent.x)
  return { start, tip, partialControl, angle }
}
