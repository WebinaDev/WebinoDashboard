"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { THEME_KIND_ICONS } from "@/builder/theme/icons"
import type { ThemeKind } from "@/builder/theme/context"
import { Library, Plus, Settings2, Star, Trash2 } from "lucide-react"

type Rule = { type: string; value?: string }
type Conditions = { include?: Rule[]; exclude?: Rule[] }
type TemplateRow = {
  id: number
  kind: string
  title: string | null
  is_default: boolean
  priority: number
  conditions: Conditions | null
  has_draft: boolean
  has_published: boolean
}
type KindGroup = { kind: ThemeKind; label: string; templates: TemplateRow[] }
type Preset = { id: string; kind: string; title: string; blurb: string }
type Kit = { id: string; title: string; blurb: string }

const RULE_TYPES = ["entire_site", "url", "url_prefix", "url_contains", "singular", "archive", "search", "not_found"] as const

export default function ThemeBuilderPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("theme_builder")
  const router = useRouter()
  const [kinds, setKinds] = useState<KindGroup[]>([])
  const [active, setActive] = useState<ThemeKind>("header")
  const [tab, setTab] = useState<"templates" | "library">("templates")
  const [presets, setPresets] = useState<Preset[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [busy, setBusy] = useState(false)

  async function load() {
    const data = await api<{ kinds: KindGroup[] }>("/api/v1/theme-builder")
    setKinds(data.kinds)
    const library = await api<{ presets: Preset[]; kits: Kit[] }>("/api/v1/theme-builder/library")
    setPresets(library.presets)
    setKits(library.kits)
  }

  useEffect(() => {
    void load().catch(() => setKinds([]))
  }, [])

  const group = kinds.find((item) => item.kind === active)

  async function create() {
    setBusy(true)
    try {
      const row = await api<TemplateRow>("/api/v1/theme-builder/templates", {
        method: "POST",
        json: { kind: active, title: t("new_title") },
      })
      router.push(`/dashboard/theme-builder/${active}/${row.id}`)
    } catch {
      toast.error(t("save_failed"))
      setBusy(false)
    }
  }

  async function apply(preset: string) {
    setBusy(true)
    try {
      await api("/api/v1/theme-builder/library/apply", { method: "POST", json: { preset } })
      toast.success(t("applied"))
      setTab("templates")
      await load()
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/dashboard/builder/settings"><Settings2 className="size-4" aria-hidden />{t("globals")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/builder">{t("pages")}</Link>
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        <Button variant={tab === "templates" ? "default" : "outline"} onClick={() => setTab("templates")}>{t("templates")}</Button>
        <Button variant={tab === "library" ? "default" : "outline"} onClick={() => setTab("library")}>
          <Library className="size-4" aria-hidden />
          {t("library")}
        </Button>
      </div>
      {tab === "library" ? (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {kits.map((kit) => (
              <article key={kit.id} className="rounded-2xl border p-4">
                <div className="flex items-center gap-2 font-semibold"><Library className="size-4" aria-hidden />{kit.title}</div>
                <p className="text-muted-foreground mt-1 text-sm">{kit.blurb}</p>
                <Button className="mt-3" disabled={busy} onClick={() => void apply(kit.id)}>{t("apply_kit")}</Button>
              </article>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {presets.map((preset) => {
              const Icon = THEME_KIND_ICONS[preset.kind as ThemeKind] ?? Library
              return (
                <article key={preset.id} className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" aria-hidden />{preset.title}</div>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">{preset.blurb}</p>
                  <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void apply(preset.id)}>{t("apply")}</Button>
                </article>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav className="flex gap-2 overflow-auto lg:flex-col">
            {kinds.map((item) => {
              const Icon = THEME_KIND_ICONS[item.kind]
              return (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => setActive(item.kind)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-start text-sm ${active === item.kind ? "border-primary bg-primary/5" : ""}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{t(`kinds.${item.kind}`)}</span>
                  <span className="text-muted-foreground text-xs">{item.templates.length}</span>
                </button>
              )
            })}
          </nav>
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                {group ? <KindTitle kind={group.kind} label={t(`kinds.${group.kind}`)} /> : null}
              </h2>
              <Button disabled={busy} onClick={() => void create()}><Plus className="size-4" aria-hidden />{t("create")}</Button>
            </div>
            {(group?.templates ?? []).length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
            {(group?.templates ?? []).map((row) => (
              <TemplateCard key={row.id} row={row} onChange={load} />
            ))}
          </section>
        </div>
      )}
    </PageShell>
  )
}

function KindTitle({ kind, label }: { kind: ThemeKind; label: string }) {
  const Icon = THEME_KIND_ICONS[kind]
  return <><Icon className="size-4" aria-hidden />{label}</>
}

function TemplateCard({ row, onChange }: { row: TemplateRow; onChange: () => Promise<void> }) {
  const t = useTranslations("theme_builder")
  const [conditions, setConditions] = useState<Conditions>(row.conditions ?? { include: [], exclude: [] })
  const [priority, setPriority] = useState(row.priority)
  const [busy, setBusy] = useState(false)

  async function run(path: string, method = "POST") {
    setBusy(true)
    try {
      await api(path, { method })
      await onChange()
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  async function saveConditions() {
    setBusy(true)
    try {
      await api(`/api/v1/theme-builder/templates/${row.id}`, {
        method: "PATCH",
        json: { conditions, priority },
      })
      toast.success(t("saved"))
      await onChange()
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{row.title}</h3>
        {row.is_default ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs"><Star className="size-3" aria-hidden />{t("default")}</span> : null}
        <span className="text-muted-foreground text-xs">{row.has_published ? t("published") : t("draft")}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" asChild><Link href={`/dashboard/theme-builder/${row.kind}/${row.id}`}>{t("edit")}</Link></Button>
        <Button size="sm" variant="outline" disabled={busy || !row.has_draft} onClick={() => void run(`/api/v1/theme-builder/templates/${row.id}/publish`)}>{t("publish")}</Button>
        <Button size="sm" variant="outline" disabled={busy || row.is_default} onClick={() => void run(`/api/v1/theme-builder/templates/${row.id}/default`)}>{t("set_default")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(`/api/v1/theme-builder/templates/${row.id}`, "DELETE")}><Trash2 className="size-3.5" aria-hidden />{t("delete")}</Button>
      </div>
      <div className="mt-4 grid gap-3 rounded-xl bg-muted/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Settings2 className="size-4" aria-hidden />{t("conditions")}</div>
        <label className="flex items-center gap-2 text-xs">
          {t("priority")}
          <input type="number" min={0} max={1000} value={priority} onChange={(event) => setPriority(Number(event.target.value))} className="h-8 w-20 rounded-md border bg-background px-2" />
        </label>
        <RuleList title={t("include")} rules={conditions.include ?? []} onChange={(include) => setConditions({ ...conditions, include })} />
        <RuleList title={t("exclude")} rules={conditions.exclude ?? []} onChange={(exclude) => setConditions({ ...conditions, exclude })} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveConditions()}>{t("save_conditions")}</Button>
        <p className="text-muted-foreground text-xs leading-5">{t("conditions_hint")}</p>
      </div>
    </article>
  )
}

function RuleList({ title, rules, onChange }: { title: string; rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const t = useTranslations("theme_builder")
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold">{title}</div>
      {rules.map((rule, index) => (
        <div key={`${rule.type}-${index}`} className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={rule.type}
            onChange={(event) => onChange(rules.map((item, i) => i === index ? { ...item, type: event.target.value } : item))}
            aria-label={title}
          >
            {RULE_TYPES.map((type) => <option key={type} value={type}>{t(type)}</option>)}
          </select>
          <input
            className="h-8 min-w-36 flex-1 rounded-md border bg-background px-2 text-xs"
            value={rule.value ?? ""}
            placeholder={t("value")}
            aria-label={t("value")}
            onChange={(event) => onChange(rules.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(rules.filter((_, i) => i !== index))}>{t("remove")}</Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rules, { type: "entire_site", value: "" }])}>{t("add_rule")}</Button>
    </div>
  )
}
