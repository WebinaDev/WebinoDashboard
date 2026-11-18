/** Server-safe allow-list for footer trust-seal embed codes (Enamad, Samandehi, …). */

const SEAL_TAGS = new Set(["a", "img", "span", "div", "picture", "source"])
const SEAL_VOID = new Set(["img", "source"])
const SEAL_ATTRS = new Set(["href", "src", "srcset", "alt", "title", "width", "height", "target", "rel", "referrerpolicy", "id", "code", "class"])
const DROP_WITH_CONTENT = /<\s*(script|style|iframe|object|embed|svg|math|noscript|form|link|meta|base|textarea|title|xmp)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi
const DROP_VOID = /<\s*(script|style|iframe|object|embed|svg|math|noscript|form|link|meta|base|textarea|title|xmp)\b[^>]*\/?\s*>/gi

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

function safeUrl(value: string): string | null {
  const decoded = value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[\u0000-\u0020]+/g, "")
    .trim()
  if (!decoded || decoded.startsWith("//")) return null
  if (decoded.startsWith("/") || decoded.startsWith("#")) return decoded
  if (/^https?:/i.test(decoded)) return decoded
  return null
}

function sanitizeAttrs(raw: string, tag: string): string {
  const kept: string[] = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase()
    if (!SEAL_ATTRS.has(name) || name.startsWith("on")) continue
    const value = match[3] ?? match[4] ?? ""
    if (name === "href" || name === "src" || name === "srcset") {
      const url = safeUrl(value)
      if (!url) continue
      kept.push(`${name}="${escapeAttr(url)}"`)
      continue
    }
    if (name === "target") {
      if (!["_blank", "_self", "_parent", "_top"].includes(value)) continue
      kept.push(`target="${value}"`)
      continue
    }
    if (name === "class" && !/^[A-Za-z0-9 _:-]+$/.test(value)) continue
    kept.push(`${name}="${escapeAttr(value)}"`)
  }
  if (tag === "a") {
    if (!kept.some((a) => a.startsWith("target="))) kept.push('target="_blank"')
    const rel = kept.findIndex((a) => a.startsWith("rel="))
    if (rel >= 0) kept.splice(rel, 1)
    kept.push('rel="noopener noreferrer"')
  }
  if (tag === "img") {
    if (!kept.some((a) => a.startsWith("loading="))) kept.push('loading="lazy"')
    if (!kept.some((a) => a.startsWith("referrerpolicy="))) kept.push('referrerpolicy="origin"')
  }
  return kept.length ? " " + kept.join(" ") : ""
}

/** Keep only links and images (no scripts, iframes, inline handlers or javascript: URLs). Works on the server. */
export function sanitizeSealHtml(html: string): string {
  if (!html.trim()) return ""
  let source = html.replace(/\0/g, "")
  source = source.replace(DROP_WITH_CONTENT, "").replace(DROP_VOID, "")
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)([^<>]*)>/g
  const parts: string[] = []
  let last = 0
  for (const match of source.matchAll(tagRe)) {
    const index = match.index ?? 0
    parts.push(source.slice(last, index).replace(/</g, "&lt;"))
    const name = match[2].toLowerCase()
    if (SEAL_TAGS.has(name)) {
      parts.push(match[1] ? `</${name}>` : `<${name}${sanitizeAttrs(match[3] ?? "", name)}${SEAL_VOID.has(name) ? " /" : ""}>`)
    }
    last = index + match[0].length
  }
  parts.push(source.slice(last).replace(/</g, "&lt;"))
  const out = parts.join("").trim()
  if (!out || !/\s(?:src|href)="/i.test(out)) return ""
  return out
}

/** Split the widget field: one embed per `###` block (or a single code). */
export function splitSeals(raw: unknown): string[] {
  return String(raw ?? "").split(/^\s*###\s*$/m).map((s) => s.trim()).filter(Boolean)
}

/** True when the footer seal markup is a Zibal badge (SiteBuilder pastes the image/link HTML). */
export function hasZibalSeal(html: string): boolean {
  return /zibal\.ir/i.test(html) || /\bid\s*=\s*["']zibal["']/i.test(html)
}
