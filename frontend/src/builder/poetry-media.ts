/**
 * Poetry audio/video: one shape for the standalone source (/v1/public/poetry/media) and legacy manual rows.
 * An entry is playable only with a file (`src`) or an external post/embed link (`link`); others are dropped,
 * so widgets never render placeholder cards.
 */
export type LiveMedia = {
  id: number; title: string; kind: string; url: string | null; external_url: string | null; embed_url: string | null
  cover: string | null; reciter?: string | null; duration?: string | null
  occasion?: { name: string; slug: string } | null; poem?: { slug: string; title: string } | null
}
export type MediaEntry = { title: string; cover: string; kind: "audio" | "video"; src: string; link: string; embed: string; duration: string; tag: string; poem: string; poemSlug: string; reciter: string }

const FILE_RE = /\.(mp3|m4a|aac|ogg|oga|wav|opus|mp4|webm|mov|m3u8)(\?|#|$)/i
const VIDEO_RE = /\.(mp4|webm|mov|m3u8)(\?|#|$)/i
const okUrl = (v: string) => /^(https?:\/\/|\/)/i.test(v) && !/^\/\//.test(v)

export function aparatEmbed(url: string): string {
  const m = /^https?:\/\/(?:www\.)?aparat\.com\/(?:v|video\/video\/embed\/videohash)\/([A-Za-z0-9]+)/i.exec(url)
  return m ? `https://www.aparat.com/video/video/embed/videohash/${m[1]}/vt/frame` : ""
}

export function fromLive(m: LiveMedia): MediaEntry | null {
  const src = m.url && okUrl(m.url) ? m.url : ""
  const link = m.external_url && /^https?:\/\//i.test(m.external_url) ? m.external_url : ""
  if (!src && !link) return null
  return {
    title: m.title || "", cover: m.cover && okUrl(m.cover) ? m.cover : "", kind: m.kind === "video" ? "video" : "audio", src, link,
    embed: m.embed_url && /^https:\/\/www\.aparat\.com\//.test(m.embed_url) ? m.embed_url : aparatEmbed(link),
    duration: m.duration || "", tag: m.occasion?.name || "", poem: m.poem?.title || "", poemSlug: m.poem?.slug || "", reciter: m.reciter || "",
  }
}

/** Legacy manual widget row → entry. `src` may be an uploaded file or an Eitaa/Aparat post link. */
export function fromRow(r: Record<string, string>): MediaEntry | null {
  const raw = (r.src || "").trim()
  if (!raw || !okUrl(raw)) return null
  const isFile = raw.startsWith("/") || FILE_RE.test(raw)
  const kind = r.kind === "video" || VIDEO_RE.test(raw) || /aparat\.com/i.test(raw) ? "video" : "audio"
  return {
    title: (r.title || "").trim(), cover: r.cover && okUrl(r.cover.trim()) ? r.cover.trim() : "", kind,
    src: isFile ? raw : "", link: isFile ? "" : raw, embed: isFile ? "" : aparatEmbed(raw),
    duration: r.duration || "", tag: r.tag || "", poem: r.poem || "", poemSlug: "", reciter: r.reciter || "",
  }
}

export const playable = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null)

/** Live query path (relative to /v1/public/poetry/). Shared by widgets and server prefetch. */
export function mediaPath(limit: number, kind = ""): string {
  const qs = new URLSearchParams({ limit: String(Math.min(60, Math.max(1, limit))) })
  if (kind === "audio" || kind === "video") qs.set("kind", kind)
  return `media?${qs}`
}

/** Widgets read the standalone source unless the editor explicitly chose manual rows. */
export const usesLiveMedia = (source: unknown) => source !== "manual"
