/** Shared poetry admin form types (poem editor + list/import). */

export type PoetryTerm = {
  id: number
  kind: "occasion" | "figure" | "style" | "meter"
  slug: string
  name: string
  description?: string | null
  sort?: number
  poems_count?: number
  seo?: { title?: string; description?: string; focus_keyword?: string }
}

export type PoetryStanza = {
  type: "title" | "stanza" | "refrain"
  layout: "couplet" | "single"
  repeat: number
  note?: string | null
  lines: string[]
}

export type PoetryFlags = {
  is_new?: boolean
  not_performed?: boolean
  rewritten?: boolean
  is_premium?: boolean
  is_short?: boolean
}

export type PoetryLink = { label?: string; url: string }

export type PoemForm = {
  id?: number
  title: string
  slug?: string
  excerpt?: string
  status: "draft" | "published"
  occasion_id?: number | null
  meter_id?: number | null
  style_label?: string
  pen_name?: string
  composed_label?: string
  melody_credit?: string
  flags: PoetryFlags
  refrain_after_each: boolean
  term_ids: number[]
  media_ids: number[]
  external_links: PoetryLink[]
  stanzas: PoetryStanza[]
}

export type PoemListRow = {
  id: number
  slug: string
  title: string
  status: string
  view_count: number
  occasion?: PoetryTerm | null
}

export const emptyPoem = (): PoemForm => ({
  title: "",
  status: "draft",
  flags: {},
  refrain_after_each: true,
  term_ids: [],
  media_ids: [],
  external_links: [],
  stanzas: [{ type: "stanza", layout: "couplet", repeat: 1, lines: [] }],
})

export function poemFromApi(d: Record<string, unknown>): PoemForm {
  const flagsRaw = d.flags
  const flags: PoetryFlags =
    Array.isArray(flagsRaw) || flagsRaw == null ? {} : (flagsRaw as PoetryFlags)
  const stanzas = (Array.isArray(d.stanzas) ? d.stanzas : []) as PoetryStanza[]
  const occasion = d.occasion as PoetryTerm | null | undefined
  const meter = d.meter as PoetryTerm | null | undefined
  return {
    id: typeof d.id === "number" ? d.id : undefined,
    title: (d.title as string) ?? "",
    slug: d.slug as string | undefined,
    excerpt: (d.excerpt as string) ?? "",
    status: (d.status as PoemForm["status"]) ?? "draft",
    occasion_id: occasion?.id ?? null,
    meter_id: meter?.id ?? null,
    style_label: (d.style_label as string) ?? "",
    pen_name: (d.pen_name as string) ?? "",
    composed_label: (d.composed_label as string) ?? "",
    melody_credit: (d.melody_credit as string) ?? "",
    flags,
    refrain_after_each: (d.refrain_after_each as boolean) ?? true,
    term_ids: (d.term_ids as number[]) ?? [],
    media_ids: (d.media_ids as number[]) ?? [],
    external_links: (d.external_links as PoetryLink[]) ?? [],
    stanzas: stanzas.map((s) => ({
      type: s.type,
      layout: s.layout ?? "couplet",
      repeat: s.repeat ?? 1,
      note: s.note ?? "",
      lines: s.lines ?? [],
    })),
  }
}
