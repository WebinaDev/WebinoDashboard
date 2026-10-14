/** A/B bucketing: sticky per visitor (localStorage), `split` = percent of visitors who get variant B. */
export type AbVariant = "a" | "b"

export function pickVariant(split: number, random: number): AbVariant {
  const pct = Math.max(0, Math.min(100, Math.round(split)))
  return random * 100 < pct ? "b" : "a"
}

export function storedVariant(raw: string | null): AbVariant | null {
  return raw === "a" || raw === "b" ? raw : null
}
