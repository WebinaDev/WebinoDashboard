export function propStr(props: Record<string, unknown>, key: string, fallback = ""): string {
  const value = props[key]
  return typeof value === "string" ? value : fallback
}

export function propNum(props: Record<string, unknown>, key: string, fallback: number): number {
  const value = props[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function propBool(props: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = props[key]
  return typeof value === "boolean" ? value : fallback
}

export function parseLinks(value: unknown, fallback: { label: string; href: string }[]): { label: string; href: string }[] {
  if (Array.isArray(value)) {
    const rows = value.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const row = item as { label?: unknown; href?: unknown }
      if (typeof row.label !== "string" || typeof row.href !== "string") return []
      return [{ label: row.label, href: row.href }]
    })
    if (rows.length) return rows
  }
  if (typeof value === "string" && value.trim()) {
    const rows = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, href] = line.split("|")
        return { label: (label ?? "").trim(), href: (href ?? "/").trim() || "/" }
      })
      .filter((row) => row.label)
    if (rows.length) return rows
  }
  return fallback
}
