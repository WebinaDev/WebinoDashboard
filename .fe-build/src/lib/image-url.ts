/**
 * Central, pluggable image URL builder for every builder/storefront image (all tenants/themes).
 *
 * - NEXT_PUBLIC_IMG_PROXY_BASE set (e.g. "/img" or "https://cdn.example.com/img"): rewrite to
 *   `${base}/${width}/${path}` (server-side imgproxy + cache does WebP/AVIF + resize). Change the
 *   pattern ONLY in `proxyUrl()` below once the final imgproxy format is fixed.
 * - otherwise: Next's built-in optimizer (`/_next/image`, sharp) which negotiates AVIF/WebP via Accept.
 * - SVG, data:, blob:, and already-optimized URLs are returned unchanged (never double-optimized).
 * - Already-compressed files (.webp/.avif/.svg/.gif) and `priority` images (logos, hero, first slide)
 *   bypass the optimizer entirely: served as the original file (backend origin for relative storage),
 *   so a cold optimizer encode can never delay above-the-fold paint.
 */
export const IMG_WIDTHS = [400, 800, 1200, 1600] as const
const QUALITY = 75

const PROXY_BASE = (process.env.NEXT_PUBLIC_IMG_PROXY_BASE ?? "").replace(/\/+$/, "")

function proxyUrl(path: string, width: number): string {
  return `${PROXY_BASE}/${width}/${path.replace(/^\/+/, "")}`
}

/** Hosts whose files we may optimize (API/storage origin + same origin); foreign hosts pass through. */
function ownPath(src: string): string | null {
  if (src.startsWith("/") && !src.startsWith("//")) return src
  try {
    const u = new URL(src)
    const api = process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).host : ""
    if ((api && u.host === api) || /^\/(storage|uploads|media)\//.test(u.pathname)) return `${u.pathname}${u.search}`
  } catch {
    /* not a URL */
  }
  return null
}

const BYPASS_EXT = /\.(webp|avif|svg|gif)(\?|#|$)/i

/** Backend origin (no /api suffix) for relative /storage|/uploads paths, when known. */
function backendOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim()
  if (!/^https?:\/\//i.test(raw)) return ""
  try {
    return new URL(raw).origin
  } catch {
    return ""
  }
}

/** Original (un-optimized) URL: relative storage paths are made absolute against the backend when configured. */
export function originalUrl(src: string): string {
  if (/^\/(storage|uploads)\//.test(src)) {
    const origin = backendOrigin()
    if (origin) return `${origin}${src}`
  }
  return src
}

/** True when the optimizer should be skipped: already-compressed formats, or above-the-fold priority images. */
export function bypassOptimizer(src: string, priority = false): boolean {
  return priority || BYPASS_EXT.test(src)
}

export function isOptimizable(src: string | null | undefined): src is string {
  if (!src || typeof src !== "string") return false
  if (/^(data|blob):/i.test(src)) return false
  if (/\.svg(\?|#|$)/i.test(src)) return false
  if (src.startsWith("/_next/image") || src.startsWith("/inline-media/")) return false
  if (PROXY_BASE && src.startsWith(PROXY_BASE + "/")) return false
  return /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(src) || ownPath(src) !== null
}

export function imageUrl(src: string, width: number = 1200, priority = false): string {
  if (!isOptimizable(src)) return src
  if (bypassOptimizer(src, priority)) return originalUrl(src)
  const path = ownPath(src)
  if (PROXY_BASE) return path ? proxyUrl(path, width) : src
  // Next optimizer: relative paths are always allowed; absolute ones must match images.remotePatterns.
  return `/_next/image?url=${encodeURIComponent(path ?? src)}&w=${width}&q=${QUALITY}`
}

export function imageSrcSet(src: string, priority = false): string | undefined {
  if (!isOptimizable(src) || bypassOptimizer(src, priority)) return undefined
  return IMG_WIDTHS.map((w) => `${imageUrl(src, w)} ${w}w`).join(", ")
}

/** Spread onto <img>: `<img {...optImg(src)} />` → optimized src + srcSet + sizes (default 100vw). */
export function optImg(src: string | null | undefined, sizes = "(max-width: 760px) 100vw, 800px", priority = false): { src: string | undefined; srcSet?: string; sizes?: string } {
  if (!src) return { src: undefined }
  const srcSet = imageSrcSet(src, priority)
  return srcSet ? { src: imageUrl(src, 1200), srcSet, sizes } : { src: imageUrl(src, 1200, priority) }
}

/** CSS background-image value with an optimized URL. */
export function bgImage(src: string | null | undefined, width = 1600, priority = false): string | undefined {
  return src ? `url("${imageUrl(src, width, priority)}")` : undefined
}
