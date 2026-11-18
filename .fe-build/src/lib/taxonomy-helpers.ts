export type TreeNode = { id: number; name: string; parent_id?: number | null }

export function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0600-\u06FF-]+/g, "")
}

export function flatTreeOptions<T extends TreeNode>(
  items: T[],
  excludeId?: number | string | null,
): Array<{ id: number; name: string; depth: number; label: string }> {
  const byParent = new Map<number | null, T[]>()
  for (const item of items) {
    const pid = item.parent_id ?? null
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(item)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
  }

  const out: Array<{ id: number; name: string; depth: number; label: string }> = []
  const walk = (parentId: number | null, depth: number) => {
    for (const item of byParent.get(parentId) ?? []) {
      if (excludeId != null && String(item.id) === String(excludeId)) {
        walk(item.id, depth + 1)
        continue
      }
      const prefix = depth > 0 ? `${"—".repeat(depth)} ` : ""
      out.push({ id: item.id, name: item.name, depth, label: `${prefix}${item.name}` })
      walk(item.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export type TaxonomyMeta = Record<string, unknown> | null | undefined

export function seoFromMeta(meta: TaxonomyMeta) {
  const m = (meta ?? {}) as Record<string, string>
  return {
    focus_keyword: m.seo_keyword ?? "",
    title: m.seo_title ?? "",
    description: m.seo_description ?? "",
  }
}

export function metaWithSeo(
  meta: TaxonomyMeta,
  seo: { focus_keyword?: string; title?: string; description?: string },
): Record<string, unknown> {
  const base = { ...(meta && typeof meta === "object" ? meta : {}) } as Record<string, unknown>
  base.seo_keyword = seo.focus_keyword?.trim() ? seo.focus_keyword.trim() : null
  base.seo_title = seo.title?.trim() ? seo.title.trim() : null
  base.seo_description = seo.description?.trim() ? seo.description.trim() : null
  return base
}

export function totalCategoryProducts(c: { products_count?: number; products_many_count?: number }) {
  return (c.products_count ?? 0) + (c.products_many_count ?? 0)
}
