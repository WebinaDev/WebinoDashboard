"use client"

import { ChevronDown, ArrowUp, ArrowDown, Trash2, Plus, FilePenLine, Send } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import type { PoemForm, PoetryStanza, PoetryTerm } from "./poetry-types"

import "./poetry-admin.css"

type Props = {
  initial: PoemForm
  terms: PoetryTerm[]
  onDone: () => void
  onError: (m: string) => void
  save: (body: PoemForm) => Promise<void>
}

function SidePanel({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="poem-side__panel" data-open={open}>
      <CollapsibleTrigger asChild>
        <button type="button" className="poem-side__trigger">
          <span>{title}</span>
          <ChevronDown aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="poem-side__body">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function IconTip({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={active ? "secondary" : "outline"}
          className={cn("size-8 shrink-0", active && "border-[color-mix(in_srgb,var(--poem-accent)_40%,transparent)]")}
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function PoemEditor({ initial, terms, onDone, onError, save }: Props) {
  const t = useTranslations("poetry_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [f, setF] = useState<PoemForm>(initial)
  const [saving, setSaving] = useState(false)
  const dir = locale === "fa" ? "rtl" : "ltr"

  const set = <K extends keyof PoemForm>(k: K, v: PoemForm[K]) => setF((p) => ({ ...p, [k]: v }))
  const byKind = useMemo(() => (k: PoetryTerm["kind"]) => terms.filter((term) => term.kind === k), [terms])
  const setStanza = (i: number, patch: Partial<PoetryStanza>) =>
    set(
      "stanzas",
      f.stanzas.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    )
  const move = (i: number, d: number) => {
    const a = [...f.stanzas]
    const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    set("stanzas", a)
  }
  const toggleTerm = (id: number) =>
    set("term_ids", f.term_ids.includes(id) ? f.term_ids.filter((x) => x !== id) : [...f.term_ids, id])

  const persist = async () => {
    setSaving(true)
    const body: PoemForm = {
      ...f,
      stanzas: f.stanzas
        .map((s) => ({ ...s, lines: s.lines.map((l) => l.trim()).filter(Boolean) }))
        .filter((s) => s.lines.length),
      external_links: f.external_links.filter((l) => l.url.trim()),
    }
    try {
      await save(body)
      onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const typeLabel = (type: PoetryStanza["type"]) => t(`stanza_type_${type}`)
  const isPublished = f.status === "published"

  return (
    <div className="poem-desk space-y-4" dir={dir}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-muted-foreground max-w-xl text-sm">{t("editor_hint")}</p>
        <TooltipProvider delayDuration={200}>
          <div className="poem-toolbar">
            <div className="poem-toolbar__status" role="group" aria-label={t("status")}>
              <button
                type="button"
                data-on={!isPublished}
                onClick={() => set("status", "draft")}
              >
                {t("status_draft")}
              </button>
              <button
                type="button"
                data-on={isPublished}
                onClick={() => set("status", "published")}
              >
                {t("status_published")}
              </button>
            </div>
            <IconTip
              label={isPublished ? t("publish_save") : tCommon("save")}
              onClick={() => void persist()}
              active={isPublished}
            >
              {isPublished ? <Send className="size-4" /> : <FilePenLine className="size-4" />}
            </IconTip>
            <Button
              type="button"
              size="sm"
              disabled={saving || !f.title.trim()}
              onClick={() => void persist()}
            >
              {saving ? tCommon("saving") : isPublished ? t("publish_save") : tCommon("save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDone}>
              {tCommon("cancel")}
            </Button>
          </div>
        </TooltipProvider>
      </header>

      <div className="poem-desk__layout">
        <section className="poem-manuscript" aria-label={t("writing_surface")}>
          <textarea
            className="poem-title-input"
            rows={1}
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("title_ph")}
            aria-label={t("title")}
          />
          <div className="poem-byline">
            <input
              value={f.pen_name ?? ""}
              onChange={(e) => set("pen_name", e.target.value)}
              placeholder={t("pen_name_ph")}
              aria-label={t("pen_name")}
            />
            <input
              value={f.composed_label ?? ""}
              onChange={(e) => set("composed_label", e.target.value)}
              placeholder={t("composed_ph")}
              aria-label={t("composed")}
            />
            <input
              value={f.style_label ?? ""}
              onChange={(e) => set("style_label", e.target.value)}
              placeholder={t("style_free_ph")}
              aria-label={t("style_free")}
            />
            <input
              value={f.melody_credit ?? ""}
              onChange={(e) => set("melody_credit", e.target.value)}
              placeholder={t("melody_ph")}
              aria-label={t("melody")}
            />
          </div>
          <div className="poem-manuscript__rule" aria-hidden />

          {f.stanzas.map((s, i) => (
            <article
              key={i}
              className={cn(
                "poem-stanza",
                s.type === "refrain" && "poem-stanza--refrain",
                s.type === "title" && "poem-stanza--title",
              )}
            >
              <div className="poem-stanza__chrome">
                <select
                  value={s.type}
                  onChange={(e) => setStanza(i, { type: e.target.value as PoetryStanza["type"] })}
                  aria-label={t("stanza_type")}
                >
                  {(["title", "stanza", "refrain"] as const).map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
                <select
                  value={s.layout}
                  onChange={(e) => setStanza(i, { layout: e.target.value as PoetryStanza["layout"] })}
                  aria-label={t("stanza_layout")}
                >
                  <option value="couplet">{t("layout_couplet")}</option>
                  <option value="single">{t("layout_single")}</option>
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <span>{t("repeat")}</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={s.repeat}
                    onChange={(e) =>
                      setStanza(i, { repeat: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </label>
                <span className="ms-auto flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => move(i, -1)}
                    aria-label={t("move_up")}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => move(i, 1)}
                    aria-label={t("move_down")}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => set("stanzas", f.stanzas.filter((_, j) => j !== i))}
                    aria-label={t("delete")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>
              <textarea
                className="poem-stanza__lines"
                rows={Math.max(3, s.lines.length + 1)}
                value={s.lines.join("\n")}
                onChange={(e) => setStanza(i, { lines: e.target.value.split("\n") })}
                placeholder={
                  s.layout === "couplet" ? t("lines_couplet_ph") : t("lines_single_ph")
                }
                aria-label={`${typeLabel(s.type)} ${i + 1}`}
              />
            </article>
          ))}

          <div className="poem-add-row">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                set("stanzas", [
                  ...f.stanzas,
                  { type: "stanza", layout: "couplet", repeat: 1, lines: [] },
                ])
              }
            >
              <Plus className="size-3.5" />
              {t("add_stanza")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                set("stanzas", [
                  ...f.stanzas,
                  { type: "refrain", layout: "couplet", repeat: 2, lines: [] },
                ])
              }
            >
              <Plus className="size-3.5" />
              {t("add_refrain")}
            </Button>
          </div>
        </section>

        <aside className="poem-side" aria-label={t("meta_aside")}>
          <SidePanel title={t("panel_identity")} defaultOpen>
            <label className="poem-field">
              <span>{t("slug")}</span>
              <input
                dir="ltr"
                value={f.slug ?? ""}
                onChange={(e) => set("slug", e.target.value)}
                placeholder={t("slug_ph")}
              />
            </label>
            <label className="poem-field">
              <span>{t("excerpt")}</span>
              <textarea
                rows={3}
                value={f.excerpt ?? ""}
                onChange={(e) => set("excerpt", e.target.value)}
              />
            </label>
            <label className="poem-field">
              <span>{t("occasion")}</span>
              <select
                value={f.occasion_id ?? ""}
                onChange={(e) => set("occasion_id", e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">—</option>
                {byKind("occasion").map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="poem-field">
              <span>{t("meter")}</span>
              <select
                value={f.meter_id ?? ""}
                onChange={(e) => set("meter_id", e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">—</option>
                {byKind("meter").map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
            </label>
          </SidePanel>

          <SidePanel title={t("panel_taxonomy")} defaultOpen>
            {(["figure", "style"] as const).map((kind) => (
              <div key={kind} className="space-y-1.5">
                <p className="text-muted-foreground text-xs">{t(`kind_${kind}`)}</p>
                <div className="poem-chips">
                  {byKind(kind).length === 0 ? (
                    <span className="text-muted-foreground text-xs">{t("no_terms")}</span>
                  ) : (
                    byKind(kind).map((term) => (
                      <button
                        key={term.id}
                        type="button"
                        className="poem-chip"
                        data-on={f.term_ids.includes(term.id)}
                        onClick={() => toggleTerm(term.id)}
                      >
                        {term.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </SidePanel>

          <SidePanel title={t("panel_flags")}>
            {(
              [
                ["is_new", "flag_is_new"],
                ["not_performed", "flag_not_performed"],
                ["rewritten", "flag_rewritten"],
                ["is_short", "flag_is_short"],
              ] as const
            ).map(([key, labelKey]) => (
              <label key={key} className="poem-check">
                <input
                  type="checkbox"
                  checked={!!f.flags[key]}
                  onChange={(e) => set("flags", { ...f.flags, [key]: e.target.checked })}
                />
                {t(labelKey)}
              </label>
            ))}
            <label className="poem-check">
              <input
                type="checkbox"
                checked={f.refrain_after_each}
                onChange={(e) => set("refrain_after_each", e.target.checked)}
              />
              {t("refrain_auto")}
            </label>
            <label className="poem-check">
              <input type="checkbox" checked={f.is_premium} onChange={(e) => set("is_premium", e.target.checked)} />
              {t("premium")}
            </label>
            <p className="poem-hint">{t("premium_hint")}</p>
          </SidePanel>

          <SidePanel title={t("panel_media")}>
            <label className="poem-field">
              <span>{t("media_ids")}</span>
              <input
                dir="ltr"
                value={f.media_ids.join(",")}
                onChange={(e) =>
                  set(
                    "media_ids",
                    e.target.value
                      .split(/[,،\s]+/)
                      .map(Number)
                      .filter((n) => n > 0),
                  )
                }
                placeholder="12, 45"
              />
            </label>
            <p className="text-muted-foreground text-xs">{t("media_ids_hint")}</p>
            {f.external_links.map((link, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
                  placeholder={t("link_label_ph")}
                  value={link.label ?? ""}
                  onChange={(e) =>
                    set(
                      "external_links",
                      f.external_links.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  className="min-w-0 flex-[1.4] rounded-lg border px-2 py-1.5 text-sm"
                  dir="ltr"
                  placeholder="https://"
                  value={link.url}
                  onChange={(e) =>
                    set(
                      "external_links",
                      f.external_links.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() =>
                    set(
                      "external_links",
                      f.external_links.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={t("delete")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => set("external_links", [...f.external_links, { label: "", url: "" }])}
            >
              <Plus className="size-3.5" />
              {t("add_link")}
            </Button>
          </SidePanel>
        </aside>
      </div>
    </div>
  )
}
