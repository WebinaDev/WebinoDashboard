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
