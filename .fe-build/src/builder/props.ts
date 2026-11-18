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

/** `target`/`rel` for a link field stored as `key` + `${key}NewTab` + `${key}Nofollow`. */
export function linkAttrs(props: Record<string, unknown>, key = "href"): { target?: string; rel?: string } {
  const newTab = props[`${key}NewTab`] === true
  const nofollow = props[`${key}Nofollow`] === true
  const rel = [newTab ? "noopener noreferrer" : "", nofollow ? "nofollow" : ""].filter(Boolean).join(" ")
  return { ...(newTab ? { target: "_blank" } : {}), ...(rel ? { rel } : {}) }
}

/** Repeater rows: arrays pass through; legacy `a|b|c` line strings map onto `keys` in order. */
export function parseRows(value: unknown, keys: string[]): Record<string, string>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const row: Record<string, string> = {}
      for (const key of keys) {
        const cell = (item as Record<string, unknown>)[key]
        row[key] = typeof cell === "string" ? cell : ""
      }
      return [row]
    })
  }
  if (typeof value !== "string") return []
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells = line.split("|")
      return Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? "").trim().replace(/\\n/g, "\n")]))
    })
}

/** Serialise repeater rows back to the legacy line format for widgets that read strings. */
export function rowsToLines(rows: Record<string, string>[], keys: string[]): string {
  return rows.map((row) => keys.map((key) => (row[key] ?? "").replaceAll("|", "/").replaceAll("\n", "\\n")).join("|")).join("\n")
}

/** `datetime-local` value (local time, minutes) for a stored date string; ISO values with Z/offset are converted. */
export function toLocalInput(value: string): string {
  if (!value) return ""
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(value)) return value.slice(0, 16)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
