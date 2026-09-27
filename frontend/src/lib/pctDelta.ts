export function pctDelta(current: number, previous?: number): number | null {
  if (previous === undefined) return null
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}
