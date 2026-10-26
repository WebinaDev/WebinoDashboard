"use client"

import { Eye, EyeOff, GripVertical, Link2, Pencil, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

import { ResumeField, type FieldCtx } from "../lib/fields"
import { durationLabel, formatResumeDate, type ResumeDate } from "../lib/jalali"
import { optLabel, sectionBySlug, tr, type ResumeRow, type SectionDef } from "../lib/schema"
import { ResumeSubnav } from "./subnav"

export const resumeApi = (path: string) => `/api/v1/resume/${path}`

export function sectionFromRoute(route: ResolvedAdminRoute): SectionDef {
  const slug = route.path.split("/").pop() ?? ""
  return sectionBySlug(slug) ?? sectionBySlug("identity")!
}

function LangTabs({ lang, onChange }: { lang: "fa" | "en"; onChange: (l: "fa" | "en") => void }) {
  return (
    <div role="tablist" aria-label="زبان" className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-sm">
      {(["fa", "en"] as const).map((l) => (
        <button key={l} role="tab" type="button" aria-selected={lang === l} onClick={() => onChange(l)}
          className={`rounded-md px-3 py-1 transition ${lang === l ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {l === "fa" ? "فارسی" : "English"}
        </button>
      ))}
    </div>
  )
}

function useCtx(lang: "fa" | "en", needs: SectionDef): FieldCtx {
  const [skills, setSkills] = useState<ResumeRow[]>([])
  const [refs, setRefs] = useState<Record<string, ResumeRow[]>>({})
  const [mediaUrls, setMediaUrls] = useState<Record<number, string>>({})
  useEffect(() => {
    if (needs.fields.some((f) => f.type === "skills")) api<ResumeRow[]>(resumeApi("skills")).then(setSkills).catch(() => {})
    for (const f of needs.fields) if (f.type === "ref" && f.ref) api<ResumeRow[]>(resumeApi(f.ref)).then((rows) => setRefs((r) => ({ ...r, [f.ref!]: rows }))).catch(() => {})
    api<{ data?: { id: number; url: string }[] } | { id: number; url: string }[]>("/api/v1/media?per_page=200").then((res) => {
      const list = Array.isArray(res) ? res : res?.data ?? []
      setMediaUrls(Object.fromEntries(list.map((m) => [m.id, m.url])))
    }).catch(() => {})
  }, [needs])
  return { lang, skills, refs, mediaUrls, rememberMedia: (id, url) => setMediaUrls((m) => ({ ...m, [id]: url })) }
}

function FormGrid({ section, row, set, ctx }: { section: SectionDef; row: Record<string, unknown>; set: (k: string, v: unknown) => void; ctx: FieldCtx }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {section.fields.map((f) => <ResumeField key={f.key} f={f} row={row} set={set} ctx={ctx} />)}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 sm:col-span-2">
        <span className="text-sm">
          برچسب «نمونه» <span className="text-muted-foreground">(داده جاگیر؛ روی سایت نمایش داده نمی‌شود مگر در ویجت فعال شود)</span>
        </span>
        <Switch checked={Boolean(row.is_placeholder)} onCheckedChange={(c) => set("is_placeholder", c)} />
      </label>
    </div>
  )
}

function SinglePage({ section }: { section: SectionDef }) {
  const [lang, setLang] = useState<"fa" | "en">("fa")
  const [row, setRow] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const ctx = useCtx(lang, section)
  useEffect(() => { api<ResumeRow>(resumeApi(section.slug)).then(setRow).catch(() => toast.error("بارگذاری نشد")) }, [section.slug])
  const save = async () => {
    if (!row) return
    setSaving(true)
    try {
      const { id: _id, ...payload } = row
      setRow(await api<ResumeRow>(resumeApi(section.slug), { method: "PUT", json: payload }))
      toast.success("ذخیره شد")
    } catch (e) {
      toast.error((e as Error).message || "ذخیره نشد")
    } finally { setSaving(false) }
  }
  return (
    <PageShell eyebrow="رزومه" title={section.label_fa} description="هر فیلد را به فارسی و انگلیسی وارد کنید؛ سایت فارسی و انگلیسی هر کدام زبان خودشان را نشان می‌دهند." actions={<LangTabs lang={lang} onChange={setLang} />}>
      <ResumeSubnav active={section.slug} />
      <div className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6" dir={lang === "fa" ? "rtl" : "ltr"}>
        {row ? <FormGrid section={section} row={row} set={(k, v) => setRow((r) => ({ ...(r ?? {}), [k]: v }))} ctx={ctx} /> : <div className="h-40 animate-pulse rounded-lg bg-muted" />}
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={save} disabled={saving || !row}>{saving ? "در حال ذخیره…" : "ذخیره"}</Button></div>
    </PageShell>
  )
}

function rowTitle(section: SectionDef, r: ResumeRow): string {
  const key = section.title ?? "title"
  const f = section.fields.find((x) => x.key === key)
  const t = f?.type === "select" ? optLabel(String(r[key] ?? "")) : tr(r, key, "fa")
  return t || tr(r, key, "en") || `#${r.id}`
}
function rowMeta(section: SectionDef, r: ResumeRow): string {
  const parts: string[] = []
  for (const f of section.fields) {
    if (parts.length >= 3) break
    if (f.key === (section.title ?? "title")) continue
    if (f.type === "select" && r[f.key]) parts.push(optLabel(String(r[f.key])))
    else if (f.type === "text" && tr(r, f.key, "fa")) parts.push(tr(r, f.key, "fa"))
    else if (f.type === "date" && r[f.key]) parts.push(formatResumeDate(r[f.key] as ResumeDate, "fa"))
    else if (f.type === "range" && r.start) parts.push(`${formatResumeDate(r.start as ResumeDate, "fa")} تا ${r.is_current ? "اکنون" : formatResumeDate(r.end as ResumeDate, "fa")}${r.duration_months ? ` · ${durationLabel(r.duration_months as number, "fa")}` : ""}`)
  }
  return parts.join(" · ")
}

function ListPage({ section }: { section: SectionDef }) {
  const [rows, setRows] = useState<ResumeRow[] | null>(null)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [lang, setLang] = useState<"fa" | "en">("fa")
  const [dragId, setDragId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const ctx = useCtx(lang, section)
  const load = useCallback(() => api<ResumeRow[]>(resumeApi(section.slug)).then(setRows).catch(() => toast.error("بارگذاری نشد")), [section.slug])
  useEffect(() => { void load() }, [load])

  const blank = useMemo(() => ({ visibility: "public", is_placeholder: false }), [])
  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const { id, duration_months: _d, order: _o, ...payload } = editing as ResumeRow
      if (id) await api(resumeApi(`${section.slug}/${id}`), { method: "PUT", json: payload })
      else await api(resumeApi(section.slug), { method: "POST", json: payload })
      setEditing(null)
      toast.success("ذخیره شد")
      void load()
    } catch (e) {
      toast.error((e as Error).message || "ذخیره نشد")
    } finally { setSaving(false) }
  }
  const patch = async (r: ResumeRow, body: Record<string, unknown>) => {
    setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, ...body } : x)) ?? rs)
    await api(resumeApi(`${section.slug}/${r.id}`), { method: "PUT", json: body }).catch(() => { toast.error("ذخیره نشد"); void load() })
  }
  const remove = async (r: ResumeRow) => {
    if (!window.confirm(`«${rowTitle(section, r)}» حذف شود؟`)) return
    await api(resumeApi(`${section.slug}/${r.id}`), { method: "DELETE" }).then(() => load()).catch(() => toast.error("حذف نشد"))
  }
  const drop = async (targetId: number) => {
    if (!rows || dragId === null || dragId === targetId) return
    const ids = rows.map((r) => r.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setRows(ids.map((id) => rows.find((r) => r.id === id)!))
    setDragId(null)
    await api<ResumeRow[]>(resumeApi(`${section.slug}/reorder`), { method: "POST", json: { ids } }).then(setRows).catch(() => toast.error("ترتیب ذخیره نشد"))
  }
  const move = (r: ResumeRow, delta: number) => {
    if (!rows) return
    const i = rows.findIndex((x) => x.id === r.id)
    const j = i + delta
    if (j < 0 || j >= rows.length) return
    setDragId(r.id)
    void (async () => { const ids = rows.map((x) => x.id); ids.splice(j, 0, ids.splice(i, 1)[0]); setRows(ids.map((id) => rows.find((x) => x.id === id)!)); await api<ResumeRow[]>(resumeApi(`${section.slug}/reorder`), { method: "POST", json: { ids } }).then(setRows); setDragId(null) })()
  }

  return (
    <PageShell eyebrow="رزومه" title={section.label_fa} description="برای تغییر ترتیب کارت‌ها را بکشید. هر مورد جدا نمایش یا مخفی می‌شود." actions={<Button onClick={() => { setLang("fa"); setEditing({ ...blank }) }}><Plus className="size-4" /> افزودن</Button>}>
      <ResumeSubnav active={section.slug} />
      {rows === null ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">هنوز موردی ثبت نشده. «افزودن» را بزنید.</div>
      ) : (
        <ul className="grid gap-3" aria-label={section.label_fa}>
          {rows.map((r) => (
            <li key={r.id} draggable onDragStart={() => setDragId(r.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(r.id)}
              className={`group flex flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition sm:flex-row sm:items-center sm:p-4 ${dragId === r.id ? "border-primary opacity-60" : "border-border"} ${r.visibility === "hidden" ? "opacity-70" : ""}`}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button type="button" aria-label="جابه‌جایی" className="cursor-grab text-muted-foreground active:cursor-grabbing" onKeyDown={(e) => { if (e.key === "ArrowUp") move(r, -1); if (e.key === "ArrowDown") move(r, 1) }}>
                  <GripVertical className="size-5" />
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{rowTitle(section, r)}</span>
                    {r.is_placeholder ? <span className="rounded-full border border-dashed border-amber-500 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">نمونه</span> : null}
                    {r.visibility === "private_link" ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"><Link2 className="size-3" />لینک خصوصی</span> : null}
                    {!tr(r, section.title ?? "title", "en") && section.fields.find((f) => f.key === (section.title ?? "title"))?.i18n ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" dir="ltr">EN missing</span> : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{rowMeta(section, r)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                <Button variant="ghost" size="icon" aria-label={r.visibility === "hidden" ? "نمایش" : "مخفی"} onClick={() => patch(r, { visibility: r.visibility === "hidden" ? "public" : "hidden" })}>
                  {r.visibility === "hidden" ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="ویرایش" onClick={() => { setLang("fa"); setEditing({ ...r }) }}><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="حذف" onClick={() => remove(r)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-3 pe-6">
              <DialogTitle>{editing?.id ? "ویرایش" : "افزودن"} · {section.label_fa}</DialogTitle>
              <LangTabs lang={lang} onChange={setLang} />
            </div>
          </DialogHeader>
          {editing ? (
            <div dir={lang === "fa" ? "rtl" : "ltr"} className="space-y-4">
              <FormGrid section={section} row={editing} set={(k, v) => setEditing((e) => ({ ...(e ?? {}), [k]: v }))} ctx={ctx} />
              <div className="space-y-1.5">
                <span className="text-sm font-medium">نمایش</span>
                <div className="flex flex-wrap gap-2">
                  {["public", "hidden", "private_link"].map((v) => (
                    <button key={v} type="button" onClick={() => setEditing((e) => ({ ...(e ?? {}), visibility: v }))}
                      className={`rounded-full border px-3 py-1 text-sm ${editing.visibility === v ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{optLabel(v)}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>انصراف</Button>
            <Button onClick={save} disabled={saving}>{saving ? "در حال ذخیره…" : "ذخیره"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

export default function ResumeSectionPageClient({ route }: { route: ResolvedAdminRoute }) {
  const section = sectionFromRoute(route)
  return section.single ? <SinglePage section={section} /> : <ListPage section={section} />
}
