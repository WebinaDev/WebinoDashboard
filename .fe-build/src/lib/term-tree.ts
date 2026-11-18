export type TermNode = {
  id: number
  name: string
  parent?: number | null
}

export type TermTreeOption = { id: number; label: string; depth: number }

/** Flat list of terms sorted as a depth-first tree (indented labels). */
export function buildTermTreeOptions(terms: TermNode[]): TermTreeOption[] {
  const byParent = new Map<number | null, TermNode[]>()
  for (const t of terms) {
    const p = t.parent ?? null
    const list = byParent.get(p) ?? []
    list.push(t)
    byParent.set(p, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  const out: TermTreeOption[] = []
  function walk(parent: number | null, depth: number) {
    for (const node of byParent.get(parent) ?? []) {
      out.push({ id: node.id, label: node.name, depth })
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function indentTermLabel(label: string, depth: number): string {
  if (depth <= 0) return label
  return `${"—".repeat(depth)} ${label}`
}
