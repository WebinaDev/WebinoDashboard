/** Classic theme chrome helpers: seeded promo stats, deals countdown, voice exclusions. */

/** Stable mulberry32 PRNG from a numeric seed. */
export function seededUnit(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function hashId(id: string | number): number {
  const s = String(id)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Promotional (non-analytics) view/sold figures for social proof.
 * Seeded from product id so numbers stay stable across reloads.
 * sensitivity 1–10 widens the base range; factor multiplies the result.
 */
export function promoStatsForProduct(
  productId: string | number,
  opts?: { factor?: number; sensitivity?: number },
): { views: number; sold: number } {
  const factor = Math.max(0.1, Number(opts?.factor ?? 1) || 1)
  const sensitivity = Math.min(10, Math.max(1, Math.round(Number(opts?.sensitivity ?? 5) || 5)))
  const rnd = seededUnit(hashId(productId) ^ 0x9e3779b9)
  const baseViews = 40 + Math.floor(rnd() * (80 + sensitivity * 40))
  const baseSold = 3 + Math.floor(rnd() * (8 + sensitivity * 6))
  return {
    views: Math.max(1, Math.round(baseViews * factor)),
    sold: Math.max(1, Math.round(baseSold * factor)),
  }
}

export type DealsCountdownParts = {
  expired: boolean
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
}

export function parseDealsEnd(end?: string | null): number | null {
  if (!end || !String(end).trim()) return null
  const raw = String(end).trim()
  // Support datetime-local / ISO / "YYYY-MM-DD HH:mm" / date-only (end of day local)
  const normalized = raw.includes("T") ? raw : raw.includes(" ") ? raw.replace(" ", "T") : `${raw}T23:59:59`
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

export function dealsCountdownParts(endMs: number, nowMs: number): DealsCountdownParts {
  const totalMs = Math.max(0, endMs - nowMs)
  const expired = totalMs <= 0
  const days = Math.floor(totalMs / 86400000)
  const hours = Math.floor((totalMs % 86400000) / 3600000)
  const minutes = Math.floor((totalMs % 3600000) / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  return { expired, days, hours, minutes, seconds, totalMs }
}

/** True when current path matches any excluded path prefix/exact entry. */
export function isVoiceExcludedPath(pathname: string, excluded?: unknown): boolean {
  if (!excluded) return false
  const list: string[] = Array.isArray(excluded)
    ? excluded.map((x) => String(x).trim()).filter(Boolean)
    : String(excluded)
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean)
  if (!list.length) return false
  const path = pathname || "/"
  return list.some((entry) => {
    if (entry.endsWith("*")) {
      const prefix = entry.slice(0, -1)
      return path === prefix || path.startsWith(prefix)
    }
    return path === entry || path.startsWith(entry.endsWith("/") ? entry : `${entry}/`)
  })
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
