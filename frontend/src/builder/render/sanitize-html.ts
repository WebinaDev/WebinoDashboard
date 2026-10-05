const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a",
  "h1", "h2", "h3", "h4", "blockquote", "span", "div", "img", "hr",
  "table", "thead", "tbody", "tr", "th", "td", "figure", "figcaption",
])

const ALLOWED_ATTR = new Set(["href", "title", "target", "rel", "src", "alt", "class", "id"])
const VOID_TAGS = new Set(["br", "hr", "img"])
const DROP_WITH_CONTENT = /<\s*(script|style|iframe|object|embed|svg|math|noscript|textarea|title|xmp|noframes|form|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi
const DROP_VOID = /<\s*(script|style|iframe|object|embed|svg|math|noscript|textarea|title|xmp|noframes|form|link|meta|base)\b[^>]*\/?\s*>/gi

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => safeCode(parseInt(num, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
}

function safeCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ""
  return String.fromCodePoint(code)
}

function safeUrl(value: string): string | null {
  const decoded = decodeEntities(value).replace(/[\u0000-\u0020]+/g, "").trim()
  if (!decoded || decoded.startsWith("//")) return null
  if (decoded.startsWith("/") || decoded.startsWith("#") || decoded.startsWith("?")) return decoded
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(decoded)
  if (!match) return decoded
  const scheme = match[1].toLowerCase()
  if (scheme === "http" || scheme === "https" || scheme === "mailto") return decoded
  return null
}

function sanitizeAttrs(raw: string, tag: string): string {
  const kept: string[] = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  let targetBlank = false
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase()
    if (!ALLOWED_ATTR.has(name) || name.startsWith("on")) continue
    const value = match[3] ?? match[4] ?? ""
    if (name === "href" || name === "src") {
      const url = safeUrl(value)
      if (!url) continue
      kept.push(`${name}="${escapeAttr(url)}"`)
      continue
    }
    if (name === "target") {
      if (!["_blank", "_self", "_parent", "_top"].includes(value)) continue
      if (value === "_blank") targetBlank = true
      kept.push(`target="${value}"`)
      continue
    }
    if (name === "class" && !/^[A-Za-z0-9 _:-]+$/.test(value)) continue
    kept.push(`${name}="${escapeAttr(value)}"`)
  }
  if (tag === "a" && targetBlank && !kept.some((attr) => attr.startsWith("rel="))) {
    kept.push('rel="noopener noreferrer"')
  }
  return kept.length ? " " + kept.join(" ") : ""
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

/** Server-safe allow-list. Does not require a DOM, so SSR and the client match. */
export function sanitizeBuilderHtml(html: string): string {
  let source = html.replace(/\0/g, "")
  source = source.replace(/<!--[\s\S]*?-->/g, "")
  for (let i = 0; i < 4; i++) source = source.replace(DROP_WITH_CONTENT, "")
  source = source.replace(DROP_VOID, "")
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)([^<>]*)>/g
  const parts: string[] = []
  let last = 0
  for (const match of source.matchAll(tagRe)) {
    const index = match.index ?? 0
    parts.push(match[0] && source.slice(last, index).replace(/</g, "&lt;"))
    const name = match[2].toLowerCase()
    if (ALLOWED_TAGS.has(name)) {
      parts.push(match[1] ? `</${name}>` : `<${name}${sanitizeAttrs(match[3] ?? "", name)}${VOID_TAGS.has(name) ? " /" : ""}>`)
    }
    last = index + match[0].length
  }
  parts.push(source.slice(last).replace(/</g, "&lt;"))
  return parts.join("")
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtube-nocookie.com"])
const VIDEO_ID = /^[\w-]{6,}$/

/** Real YouTube and Aparat hosts only. Returns a normalized embed URL or null. */
export function embedVideoSrc(src: string): string | null {
  let url: URL
  try {
    url = new URL(src.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? ""
    return VIDEO_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null
  }
  if (YOUTUBE_HOSTS.has(host)) {
    const embed = url.pathname.match(/^\/embed\/([\w-]{6,})/)
    if (embed) return `https://www.youtube.com/embed/${embed[1]}`
    const watch = url.searchParams.get("v") ?? ""
    if (url.pathname === "/watch" && VIDEO_ID.test(watch)) return `https://www.youtube.com/embed/${watch}`
    const shorts = url.pathname.match(/^\/shorts\/([\w-]{6,})/)
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`
    return null
  }
  if (host === "aparat.com") {
    if (url.pathname === "/" || url.pathname === "") return null
    return url.toString()
  }
  return null
}
