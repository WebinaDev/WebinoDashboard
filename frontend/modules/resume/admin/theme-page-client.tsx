"use client"

import { Check } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

import { optLabel, RESUME_SECTIONS, RESUME_THEMES, type ResumeRow } from "../lib/schema"
import { ResumeSubnav } from "./subnav"

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"

function ThemeSwatch({ k }: { k: string }) {
  const t = RESUME_THEMES[k]
  const d = t.tokens[t.tokens.default_mode]
  return (
    <div className="h-28 overflow-hidden rounded-lg border" style={{ background: d["--bg"], color: d["--text"], fontFamily: t.tokens.font_fa }}>
      <div className="flex h-full flex-col justify-between p-3">
        <div className="flex items-center gap-2">
          <span className="size-8" style={{ background: `linear-gradient(135deg, ${d["--accent"]}, ${d["--accent-2"]})`, borderRadius: t.tokens.radius }} />
          <span className="text-sm font-bold">{t.name_fa}</span>
        </div>
        <div className="flex gap-1.5">
          {["--accent", "--accent-2", "--surface", "--border"].map((v) => <span key={v} className="h-3 flex-1 rounded-sm" style={{ background: d[v] }} />)}
        </div>
      </div>
    </div>
  )
}

export default function ResumeThemePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const [s, setS] = useState<ResumeRow | null>(null)
  const [siteLang, setSiteLang] = useState<string>("fa")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api<ResumeRow>("/api/v1/resume/settings").then(setS).catch(() => toast.error("بارگذاری نشد"))
    api<{ default_locale: string }>("/api/v1/settings/site-language").then((r) => setSiteLang(r.default_locale)).catch(() => {})
  }, [])
  const set = (k: string, v: unknown) => setS((x) => (x ? { ...x, [k]: v } : x))
  const save = async () => {
    if (!s) return
    setBusy(true)
    try {
      const { id: _i, ...body } = s
      setS(await api<ResumeRow>("/api/v1/resume/settings", { method: "PUT", json: body }))
      await api("/api/v1/settings/site-language", { method: "PUT", json: { default_locale: siteLang } }).catch(() => toast.message("زبان پیش‌فرض سایت فقط با دسترسی تنظیمات قابل تغییر است"))
      toast.success("ذخیره شد")
    } catch (e) { toast.error((e as Error).message || "ذخیره نشد") } finally { setBusy(false) }
  }
  const applyLayout = async () => {
    if (!s?.theme_key) return
    if (!window.confirm("چیدمان صفحه‌های «home» (فارسی) و «en» (انگلیسی) با چیدمان پیش‌فرض این تم بازنویسی شود؟ نسخه قبلی در تاریخچه صفحه‌ساز ذخیره می‌شود.")) return
    setBusy(true)
    try {
      await api("/api/v1/resume/theme/apply", { method: "POST", json: { theme_key: s.theme_key, langs: ["fa", "en"] } })
      toast.success("چیدمان تم اعمال شد؛ نسخه قبلی در تاریخچه صفحه‌ساز است")
    } catch (e) { toast.error((e as Error).message || "اعمال نشد") } finally { setBusy(false) }
  }
  const order = (Array.isArray(s?.section_order) && (s!.section_order as string[]).length ? (s!.section_order as string[]) : RESUME_SECTIONS.filter((x) => !x.single).map((x) => x.slug))
  const moveSec = (i: number, d: number) => { const n = [...order]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set("section_order", n) }

  return (
    <PageShell eyebrow="رزومه" title="تم و نمایش" description="تعویض تم فقط ظاهر را عوض می‌کند و داده‌ها دست نمی‌خورند." actions={<Button onClick={save} disabled={busy || !s}>ذخیره</Button>}>
      <ResumeSubnav active="settings" />
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-3 font-semibold">تم رزومه</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {Object.values(RESUME_THEMES).map((t) => {
            const on = s?.theme_key === t.key
            return (
              <button key={t.key} type="button" onClick={() => set("theme_key", t.key)} aria-pressed={on}
                className={`relative rounded-xl border p-2 text-start transition ${on ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/60"}`}>
                <ThemeSwatch k={t.key} />
                <div className="p-1.5 pt-2.5">
                  <div className="flex items-center justify-between"><span className="font-medium">{t.name_fa}</span><span className="text-xs text-muted-foreground" dir="ltr">{t.name_en}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description_fa}</p>
                </div>
                {on ? <span className="absolute end-3 top-3 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></span> : null}
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
          <p className="flex-1 text-sm text-muted-foreground">اعمال چیدمان پیش‌فرض تم: ردیف‌های صفحه‌ساز صفحه اصلی (فارسی) و /en (انگلیسی) را با ویجت‌های resume.* این تم می‌سازد و نسخه قبلی را بکاپ می‌گیرد.</p>
          <Button variant="outline" onClick={applyLayout} disabled={busy || !s?.theme_key}>اعمال چیدمان تم</Button>
        </div>
      </section>

      <section className="mt-4 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <h2 className="font-semibold sm:col-span-2 lg:col-span-3">نمایش و زبان</h2>
        <div className="space-y-1.5"><Label>زبان پیش‌فرض سایت</Label>
          <select className={selectCls} value={siteLang} onChange={(e) => setSiteLang(e.target.value)}>
            <option value="fa">فارسی (راست‌به‌چپ، تقویم جلالی)</option><option value="en">English (LTR, Gregorian)</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label>حالت رنگ</Label>
          <select className={selectCls} value={String(s?.mode ?? "system")} onChange={(e) => set("mode", e.target.value)}>
            {["system", "light", "dark"].map((v) => <option key={v} value={v}>{optLabel(v)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>تقویم تاریخ‌ها</Label>
          <select className={selectCls} value={String(s?.date_calendar ?? "auto")} onChange={(e) => set("date_calendar", e.target.value)}>
            {["auto", "jalali", "gregorian"].map((v) => <option key={v} value={v}>{optLabel(v)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>اکسنت حالت روشن</Label>
          <div className="flex gap-2"><Input type="color" className="h-9 w-14 p-1" value={String(s?.accent || RESUME_THEMES[String(s?.theme_key ?? "code-noir")]?.tokens.light["--accent"] || "#000000")} onChange={(e) => set("accent", e.target.value)} />
            <Button variant="ghost" size="sm" onClick={() => set("accent", null)}>پیش‌فرض تم</Button></div>
        </div>
        <div className="space-y-1.5"><Label>اکسنت حالت تیره</Label>
          <div className="flex gap-2"><Input type="color" className="h-9 w-14 p-1" value={String(s?.accent_dark || RESUME_THEMES[String(s?.theme_key ?? "code-noir")]?.tokens.dark["--accent"] || "#ffffff")} onChange={(e) => set("accent_dark", e.target.value)} />
            <Button variant="ghost" size="sm" onClick={() => set("accent_dark", null)}>پیش‌فرض تم</Button></div>
        </div>
        <div className="space-y-1.5"><Label>زبان‌های سایت رزومه</Label>
          <div className="flex gap-3 text-sm">
            {["fa", "en"].map((l) => {
              const langs = Array.isArray(s?.languages) ? (s!.languages as string[]) : ["fa", "en"]
              return <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={langs.includes(l)} onChange={(e) => set("languages", e.target.checked ? [...new Set([...langs, l])] : langs.filter((x) => x !== l))} />{optLabel(l)}</label>
            })}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-3 font-semibold">ترتیب بخش‌ها (برای چیدمان تم و خروجی PDF فاز بعد)</h2>
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {order.map((slug, i) => (
            <li key={slug} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
              <span>{RESUME_SECTIONS.find((x) => x.slug === slug)?.label_fa ?? slug}</span>
              <span className="flex gap-1"><Button size="sm" variant="ghost" aria-label="بالا" onClick={() => moveSec(i, -1)}>↑</Button><Button size="sm" variant="ghost" aria-label="پایین" onClick={() => moveSec(i, 1)}>↓</Button></span>
            </li>
          ))}
        </ol>
      </section>
      <section className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        خروجی PDF رزومه (فارسی و انگلیسی) در فاز بعد از همین داده و ترتیب ساخته می‌شود.
      </section>
    </PageShell>
  )
}
