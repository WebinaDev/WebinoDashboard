/**
 * Pull question/answer pairs out of a CMS page body. Handles the imported WordPress
 * markup (ishop `faq__faq` lists, Elementor accordion/toggle, Rank Math/Yoast FAQ blocks),
 * <details>/<summary>, heading + paragraph pairs and a plain "Q?\nA" text layout.
 */
export type FaqItem = { q: string; a: string }

const PLACEHOLDER = /لورم\s*ایپسوم|lorem\s+ipsum/i

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "\u200c")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|form|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
}

function clean(list: FaqItem[]): FaqItem[] {
  const seen = new Set<string>()
  return list
    .map((x) => ({ q: htmlToText(x.q).replace(/\n+/g, " "), a: htmlToText(x.a) }))
    .filter((x) => x.q && x.a && !PLACEHOLDER.test(x.a) && !seen.has(x.q) && (seen.add(x.q), true))
}

export function extractFaq(body: string | null | undefined): FaqItem[] {
  const html = String(body ?? "")
  if (!html.trim()) return []
  const patterns: RegExp[] = [
    // ishop: <li><span>Q</span><div class="faq__faq-slide-items">A</div></li>
    /<li[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<div[^>]*faq__faq-slide-items[^>]*>([\s\S]*?)<\/div>\s*<\/li>/gi,
    // Elementor accordion / toggle
    /class="[^"]*elementor-tab-title[^"]*"[^>]*>([\s\S]*?)<\/(?:div|h\d)>[\s\S]*?class="[^"]*elementor-tab-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Rank Math / Yoast
    /class="[^"]*(?:rank-math-question|schema-faq-question)[^"]*"[^>]*>([\s\S]*?)<\/(?:h\d|strong|div)>[\s\S]*?class="[^"]*(?:rank-math-answer|schema-faq-answer)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p)>/gi,
    /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
    /<h[2-4][^>]*>([^<]*[؟?][^<]*)<\/h[2-4]>\s*((?:<p[^>]*>[\s\S]*?<\/p>\s*)+)/gi,
  ]
  for (const re of patterns) {
    const items = clean([...html.matchAll(re)].map((m) => ({ q: m[1], a: m[2] })))
    if (items.length) return items
  }
  // Plain text: a line ending in "?" is a question, following lines are its answer.
  if (!isImportedBuilderHtml(html)) {
    const lines = htmlToText(html).split("\n").map((l) => l.trim()).filter(Boolean)
    const out: FaqItem[] = []
    for (const line of lines) {
      if (/[؟?]$/.test(line)) out.push({ q: line, a: "" })
      else if (out.length) out[out.length - 1].a += (out[out.length - 1].a ? "\n" : "") + line
    }
    return clean(out)
  }
  return []
}

/** WordPress page-builder exports (Elementor/ishop) that render as an empty shell here. */
export function isImportedBuilderHtml(body: string | null | undefined): boolean {
  return /data-elementor-|elementor-widget|ishop_|class="ishop/i.test(String(body ?? ""))
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  }
}

export type ContactFallback = { phones: string[]; emails: string[]; address?: string; hours?: string }

/** Best-effort contact facts from a plain-text CMS page body (used when theme settings are empty). */
export function parseContactText(text: string): ContactFallback {
  const fa = "۰۱۲۳۴۵۶۷۸۹"
  const latin = text.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
  const emails = [...new Set(latin.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [])]
  const phones = [...new Set((latin.match(/(?:\+98|0)9\d{9}|0\d{2,3}[- ]?\d{7,8}/g) ?? []).map((p) => p.replace(/[- ]/g, "")))]
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const address = lines.find((l) => /آدرس|نشانی|دفتر/.test(l))?.replace(/^.*?(آدرس|نشانی|دفتر مرکزی|دفتر)\s*[:：]?\s*/, "")
  const hours = lines.find((l) => /ساعت|شنبه/.test(l))
  return { phones, emails, address: address || undefined, hours: hours || undefined }
}
