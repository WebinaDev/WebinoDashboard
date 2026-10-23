/** SEO helpers for the builder single-poem page (`/<page>?poem=<slug>`, poem-single widget). Pure, unit-tested. */

export type PoemSeoSource = {
  slug: string
  title: string
  excerpt?: string | null
  pen_name?: string | null
  published_at?: string | null
  sequence?: { type: string; lines: string[] }[]
}

/** Plain-text description from the poem's first lines (title blocks skipped), cut at a word boundary near `max`. */
export function poemDescription(poem: PoemSeoSource, max = 155): string {
  const lines: string[] = []
  for (const b of poem.sequence ?? []) {
    if (b.type === "title") continue
    for (const l of b.lines ?? []) {
      const t = l.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
      if (t) lines.push(t)
    }
    if (lines.join(" / ").length > max) break
  }
  let text = lines.join(" / ") || (poem.excerpt ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
  if (text.length > max) {
    const cut = text.slice(0, max)
    const sp = cut.lastIndexOf(" ")
    text = `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s/،,.]+$/, "")}…`
  }
  return text
}

/** «<poem title> | <site name>» (no duplicate when the site name is empty). */
export function poemTitle(poem: Pick<PoemSeoSource, "title">, siteName?: string | null): string {
  const s = (siteName ?? "").trim()
  return s ? `${poem.title} | ${s}` : poem.title
}

/** Canonical path for a poem shown on builder page `pageSlug`. */
export function poemCanonicalPath(pageSlug: string, poemSlug: string): string {
  return `/${pageSlug.replace(/^\/+|\/+$/g, "")}?poem=${encodeURIComponent(poemSlug)}`
}

/** schema.org CreativeWork (poem) JSON-LD. */
export function poemJsonLd(poem: PoemSeoSource, url: string, siteName?: string | null, lang = "fa"): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    genre: "Poetry",
    additionalType: "https://schema.org/Poem",
    name: poem.title,
    headline: poem.title,
    description: poemDescription(poem),
    inLanguage: lang,
    url,
    ...(poem.pen_name ? { author: { "@type": "Person", name: poem.pen_name } } : {}),
    ...(poem.published_at ? { datePublished: poem.published_at } : {}),
    ...(siteName ? { publisher: { "@type": "Organization", name: siteName } } : {}),
  }
}
