import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"

/**
 * Builder media stored as `data:` URLs (e.g. a 170KB base64 SVG logo) would otherwise be inlined into the
 * HTML *and* the RSC payload once per use. We write each one to a content-addressed file and serve it
 * from /inline-media/<hash>.<ext> with immutable caching. Applies to every tenant/theme.
 */
export const INLINE_MEDIA_DIR = process.env.INLINE_MEDIA_DIR || path.join(process.cwd(), ".next", "cache", "inline-media")
const MIN_BYTES = 1024
const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" }
const DATA_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i
const memo = new Map<string, string>()

export function hoistDataUrl(value: string): string {
  if (value.length < MIN_BYTES || !value.startsWith("data:")) return value
  const hit = memo.get(value)
  if (hit) return hit
  const m = DATA_RE.exec(value)
  const ext = m ? EXT[m[1].toLowerCase()] : undefined
  if (!m || !ext) return value
  try {
    const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64")
    const name = `${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.${ext}`
    const file = path.join(INLINE_MEDIA_DIR, name)
    if (!existsSync(file)) {
      mkdirSync(INLINE_MEDIA_DIR, { recursive: true })
      writeFileSync(file, bytes)
    }
    const url = `/inline-media/${name}`
    if (memo.size > 500) memo.clear()
    memo.set(value, url)
    return url
  } catch {
    return value
  }
}

/** Deep-replace large data: URLs in any JSON-ish value (builder props, styles, globals, branding). */
export function hoistDataUrls<T>(input: T): T {
  const visit = (v: unknown): unknown => {
    if (typeof v === "string") return hoistDataUrl(v)
    if (Array.isArray(v)) return v.map(visit)
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v)) out[k] = visit(x)
      return out
    }
    return v
  }
  return visit(input) as T
}

export const INLINE_MEDIA_TYPES: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]))
