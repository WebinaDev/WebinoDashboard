/** Helpers for comparison / HTML tables: yes-no marks and a scroll wrapper class. */

const YES = /^(دارد|بله|yes|✓|✔|✅)$/i
const NO = /^(ندارد|خیر|no|✗|✘|❌|×)$/i

export type CompareMark = "yes" | "no" | ""

export function compareMark(text: string): CompareMark {
  const t = text.replace(/\s+/g, " ").trim()
  if (YES.test(t)) return "yes"
  if (NO.test(t)) return "no"
  return ""
}

/** After sanitizing HTML, tag دارد/ندارد cells and keep tables in a horizontal scroller. */
export function decorateCompareHtml(html: string): string {
  const marked = html.replace(/<(td|th)(\b[^>]*)>([\s\S]*?)<\/\1>/gi, (all, tag: string, attrs: string, inner: string) => {
    const kind = compareMark(inner.replace(/<[^>]+>/g, ""))
    if (!kind) return all
    const cls = `wb-cmp-${kind}`
    const nextAttrs = /class\s*=/.test(attrs)
      ? attrs.replace(/class\s*=\s*("([^"]*)"|'([^']*)')/i, (_m, _q, a, b) => `class="${(a ?? b ?? "").trim()} ${cls}"`)
      : `${attrs} class="${cls}"`
    const icon = kind === "yes" ? "✓" : "✕"
    return `<${tag}${nextAttrs}><span class="wb-cmp-icon" aria-hidden="true">${icon}</span><span class="wb-cmp-label">${inner}</span></${tag}>`
  })
  if (!/<table[\s>]/i.test(marked)) return marked
  if (/wb-compare-wrap|wbx-compare-wrap/.test(marked)) return marked
  const wrapped = marked.replace(/<table(\b[^>]*)>/gi, (_m, attrs: string) => {
    const next = /class\s*=/.test(attrs)
      ? attrs.replace(/class\s*=\s*"/, "class=\"wb-compare-table ")
      : `${attrs} class="wb-compare-table"`
    return `<div class="wb-compare-wrap"><table${next}>`
  }).replace(/<\/table>/gi, "</table></div>")
  return wrapped
}
