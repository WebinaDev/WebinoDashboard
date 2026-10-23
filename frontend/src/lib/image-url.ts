/**
 * Central, pluggable image URL builder for every builder/storefront image (all tenants/themes).
 *
 * - NEXT_PUBLIC_IMG_PROXY_BASE set (e.g. "/img" or "https://cdn.example.com/img"): rewrite to
 *   `${base}/${width}/${path}` (server-side imgproxy + cache does WebP/AVIF + resize). Change the
 *   pattern ONLY in `proxyUrl()` below once the final imgproxy format is fixed.
 * - otherwise: Next's built-in optimizer (`/_next/image`, sharp) which negotiates AVIF/WebP via Accept.
 * - SVG, data:, blob:, and already-optimized URLs are returned unchanged (never double-optimized).
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

export function isOptimizable(src: string | null | undefined): src is string {
  if (!src || typeof src !== "string") return false
  if (/^(data|blob):/i.test(src)) return false
  if (/\.svg(\?|#|$)/i.test(src)) return false
  if (src.startsWith("/_next/image") || src.startsWith("/inline-media/")) return false
  if (PROXY_BASE && src.startsWith(PROXY_BASE + "/")) return false
  return /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(src) || ownPath(src) !== null
}

export function imageUrl(src: string, width: number = 1200): string {
  if (!isOptimizable(src)) return src
  const path = ownPath(src)
  if (PROXY_BASE) return path ? proxyUrl(path, width) : src
  // Next optimizer: relative paths are always allowed; absolute ones must match images.remotePatterns.
  return `/_next/image?url=${encodeURIComponent(path ?? src)}&w=${width}&q=${QUALITY}`
}

export function imageSrcSet(src: string): string | undefined {
  if (!isOptimizable(src)) return undefined
  return IMG_WIDTHS.map((w) => `${imageUrl(src, w)} ${w}w`).join(", ")
}

/** Spread onto <img>: `<img {...optImg(src)} />` → optimized src + srcSet + sizes (default 100vw). */
export function optImg(src: string | null | undefined, sizes = "(max-width: 760px) 100vw, 800px"): { src: string | undefined; srcSet?: string; sizes?: string } {
  if (!src) return { src: undefined }
  const srcSet = imageSrcSet(src)
  return srcSet ? { src: imageUrl(src, 1200), srcSet, sizes } : { src }
}

/** CSS background-image value with an optimized URL. */
export function bgImage(src: string | null | undefined, width = 1600): string | undefined {
  return src ? `url("${imageUrl(src, width)}")` : undefined
}
