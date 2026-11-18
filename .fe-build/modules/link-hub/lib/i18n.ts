import type { PublicBlock, PublicPage } from "./LinkHubView"

export type LhLocale = "fa" | "en"

type ThemeI18n = { locales?: string[]; default_locale?: string; i18n?: { en?: Record<string, string> } }

/** Locales a page offers (only bilingual pages list more than one). */
export function pageLocales(theme: Record<string, unknown> | null | undefined): LhLocale[] {
  const t = (theme ?? {}) as ThemeI18n
  const list = (Array.isArray(t.locales) ? t.locales : []).filter((l): l is LhLocale => l === "fa" || l === "en")
  return list.length > 1 ? list : ["fa"]
}

export function defaultLocale(theme: Record<string, unknown> | null | undefined): LhLocale {
  const locales = pageLocales(theme)
  const t = (theme ?? {}) as ThemeI18n
  return locales.includes(t.default_locale as LhLocale) ? (t.default_locale as LhLocale) : locales[0]
}

function localizeBlock(block: PublicBlock, locale: LhLocale): PublicBlock {
  if (locale === "fa") return block
  const p = block.payload
  const en = ((p.i18n as { en?: Record<string, unknown> } | undefined)?.en ?? {}) as Record<string, unknown>
  const swapLabels = (rows: unknown) =>
    Array.isArray(rows)
      ? rows.map((r) => (r && typeof r === "object" && (r as Record<string, unknown>).label_en ? { ...(r as object), label: (r as Record<string, unknown>).label_en } : r))
      : rows
  return { ...block, payload: { ...p, ...en, socials: swapLabels(p.socials), phones: swapLabels(p.phones) } }
}

/** Applies i18n.en overrides (theme, profile, blocks) for English; Persian is the stored base. */
export function localizePage(page: PublicPage, locale: LhLocale): PublicPage {
  if (locale === "fa") return page
  const theme = (page.profile.theme_json ?? {}) as Record<string, unknown> & ThemeI18n
  const en = theme.i18n?.en ?? {}
  const { title, bio, ...themeText } = en
  return {
    ...page,
    profile: {
      ...page.profile,
      title: title || page.profile.title,
      bio: bio || page.profile.bio,
      theme_json: { ...theme, ...themeText },
    },
    blocks: page.blocks.map((b) => localizeBlock(b, locale)),
  }
}

export const LH_UI: Record<LhLocale, Record<string, string>> = {
  fa: {
    copy: "کپی",
    copied: "کپی شد",
    save_contact: "ذخیره مخاطب",
    links: "لینک‌ها",
    contact: "راه‌های ارتباط",
    skills: "مهارت‌ها",
    open: "باز کردن",
    quick: "راه‌های تماس سریع",
    lang: "English",
  },
  en: {
    copy: "Copy",
    copied: "Copied",
    save_contact: "Save contact",
    links: "Links",
    contact: "Get in touch",
    skills: "Skills",
    open: "Open",
    quick: "Quick contact",
    lang: "فارسی",
  },
}

/** Builds a vCard 3.0 from the page's own contact data. */
export function buildVCard(page: PublicPage, extra?: { org?: string; title?: string }): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`)
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(page.profile.title || "")}`, `N:${esc(page.profile.title || "")};;;;`]
  if (extra?.org) lines.push(`ORG:${esc(extra.org)}`)
  if (extra?.title) lines.push(`TITLE:${esc(extra.title)}`)
  const tels = new Set<string>()
  const mails = new Set<string>()
  const urls = new Set<string>()
  for (const b of page.blocks) {
    const p = b.payload
    if (b.type === "contact") {
      if (p.phone) tels.add(String(p.phone))
      for (const ph of (Array.isArray(p.phones) ? p.phones : []) as Array<{ value?: string }>) if (ph.value) tels.add(ph.value)
      if (p.email) mails.add(String(p.email))
      for (const s of (Array.isArray(p.socials) ? p.socials : []) as Array<{ url?: string }>) {
        if (s.url?.startsWith("mailto:")) mails.add(s.url.slice(7))
        else if (s.url && /^https?:/.test(s.url)) urls.add(s.url)
      }
    }
    const u = String(p.url ?? "")
    if (u.startsWith("tel:")) tels.add(u.slice(4))
    else if (u.startsWith("mailto:")) mails.add(u.slice(7))
    else if (/^https?:/.test(u) && !/wa\.me/.test(u)) urls.add(u)
  }
  tels.forEach((t) => lines.push(`TEL;TYPE=CELL:${t.replace(/[^\d+]/g, "")}`))
  mails.forEach((m) => lines.push(`EMAIL;TYPE=INTERNET:${m}`))
  urls.forEach((u) => lines.push(`URL:${u}`))
  lines.push("END:VCARD")
  return lines.join("\r\n")
}

export function downloadVCard(page: PublicPage, extra?: { org?: string; title?: string }) {
  const blob = new Blob([buildVCard(page, extra)], { type: "text/vcard;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${(page.profile.title || "contact").replace(/\s+/g, "-")}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
