/** Multi-level menu rows (`label|href|level`) → nested tree. */
export type NavItem = { label: string; href: string; children: NavItem[] }

export function buildNavTree(rows: { label: string; href: string; level: string }[]): NavItem[] {
  const root: NavItem[] = []
  const stack: { level: number; item: NavItem }[] = []
  for (const row of rows) {
    if (!row.label) continue
    const level = Math.max(0, Math.min(2, Number.parseInt(row.level, 10) || 0))
    const item: NavItem = { label: row.label, href: row.href || "#", children: [] }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.item.children.push(item)
    else root.push(item)
    stack.push({ level, item })
  }
  return root
}

