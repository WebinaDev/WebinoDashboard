/** Site custom code (Code Manager): path scoping and splitting into scripts / other markup (pure; tested). */
import type { CustomCode } from "./globals"

export function codeMatchesPath(entry: Pick<CustomCode, "paths" | "enabled">, path: string): boolean {
  if (!entry.enabled) return false
  const rules = (entry.paths ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!rules.length) return true
  const clean = path.split(/[?#]/)[0] || "/"
  return rules.some((rule) => (rule.endsWith("*") ? clean.startsWith(rule.slice(0, -1)) : clean === rule || clean === `${rule}/`))
}

export type CodePart = { kind: "script"; src?: string; body: string; async?: boolean; defer?: boolean } | { kind: "html"; body: string }

/** Splits code into <script> parts (re-created as real script elements so they run) and the remaining markup. */
export function splitCode(code: string): CodePart[] {
  const parts: CodePart[] = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  let last = 0
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const before = code.slice(last, m.index).trim()
    if (before) parts.push({ kind: "html", body: before })
    const attrs = m[1] ?? ""
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]
    parts.push({ kind: "script", src: src && /^(https:\/\/|\/(?!\/))/.test(src) ? src : undefined, body: src ? "" : m[2] ?? "", async: /\basync\b/i.test(attrs), defer: /\bdefer\b/i.test(attrs) })
    last = m.index + m[0].length
  }
  const rest = code.slice(last).trim()
  if (rest) parts.push({ kind: "html", body: rest })
  return parts
}

/** Escape a sequence that would prematurely close a <style> element when the CSS is inlined in HTML. */
export function escapeStyleText(css: string): string {
  return css.replace(/<\/style/gi, "\\3C/style")
}

/**
 * Custom CSS is often authored as a raw <style> block. If a length cap (or a bad paste) cuts the
 * block before </style>, the rest of the page is parsed as CSS and disappears. Close any unclosed
 * style tag and escape embedded </style sequences inside the CSS text.
 */
export function closeOpenStyleTags(html: string): string {
  if (!html || !/<style\b/i.test(html)) return html
  let out = ""
  const openRe = /<style\b[^>]*>/gi
  let last = 0
  let match: RegExpExecArray | null
  while ((match = openRe.exec(html))) {
    out += html.slice(last, match.index + match[0].length)
    const contentStart = match.index + match[0].length
    const rest = html.slice(contentStart)
    const nextOpen = /<style\b/i.exec(rest)
    const region = nextOpen ? rest.slice(0, nextOpen.index) : rest
    let closeIndex = -1
    let closeLen = 0
    const closeRe = /<\/style\s*>/gi
    let close: RegExpExecArray | null
    while ((close = closeRe.exec(region))) {
      closeIndex = close.index
      closeLen = close[0].length
    }
    if (closeIndex >= 0) {
      out += escapeStyleText(region.slice(0, closeIndex)) + region.slice(closeIndex, closeIndex + closeLen)
      last = contentStart + closeIndex + closeLen
      openRe.lastIndex = last
    } else {
      out += escapeStyleText(rest) + "</style>"
      last = html.length
      break
    }
  }
  out += html.slice(last)
  return out
}
