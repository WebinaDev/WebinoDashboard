/** Media alt text may arrive as `alt_text` (preferred) or legacy `alt`. */
export type MediaAltFields = {
  alt?: string | null
  alt_text?: string | null
}

export function resolveMediaAlt(item: MediaAltFields | null | undefined): string {
  if (!item) return ""
  const fromAltText = item.alt_text?.trim()
  if (fromAltText) return fromAltText
  return item.alt?.trim() ?? ""
}

/** Payload for PATCH /api/v1/media — API field is `alt`. */
export function mediaAltPatch(altText: string): { alt: string } {
  return { alt: altText.trim() }
}
