export type ParentTreeNode = { id: number; title: string; parent?: number | null }

export type ParentTreeOption = { id: number; label: string; depth: number }

/** Flatten a page/category forest into indented select options (max depth guard). */
export function buildParentTreeOptions(
  items: ParentTreeNode[],
  excludeId?: number | null,
  maxDepth = 8,
): ParentTreeOption[] {
  const byParent = new Map<number | null, ParentTreeNode[]>()
  for (const item of items) {
    if (excludeId != null && item.id === excludeId) continue
    const key = item.parent ?? null
    const list = byParent.get(key) ?? []
    list.push(item)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title))
  }

  const out: ParentTreeOption[] = []
  function walk(parentId: number | null, depth: number) {
    if (depth > maxDepth) return
    const children = byParent.get(parentId) ?? []
    for (const c of children) {
      const prefix = depth > 0 ? `${"—".repeat(depth)} ` : ""
      out.push({ id: c.id, label: `${prefix}${c.title}`, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
