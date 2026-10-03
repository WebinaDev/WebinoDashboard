"use client"

import {
  Blocks,
  Image as ImageIcon,
  Link2,
  ListTree,
  Monitor,
  MousePointerClick,
  Paintbrush,
  Palette,
  Redo2,
  Search,
  Settings2,
  Smartphone,
  Tablet,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { asGlobals, COLOR_TOKENS, DEFAULT_GLOBALS, type BuilderGlobals } from "../globals"
import { createWidget, WIDGET_CATEGORIES, WIDGETS, widgetDef } from "../registry"
import { documentCss, mergeStyle } from "../style"
import { WidgetGlyph } from "../theme/icons"
import {
  ishopFooterDocument,
  ishopHeaderDocument,
  previewHref,
} from "../templates/ishop"
import {
  addColumn,
  addSection,
  defaultColumnId,
  duplicateWidget,
  emptyDocument,
  findSelection,
  insertWidget,
  isDocument,
  moveWidget,
  removeNode,
  resizeColumn,
  updateColumn,
  updateSection,
  updateWidget,
} from "../tree"
import type { BuilderDocument, DeviceMode, EditorApi, StyleProps } from "../types"
import { DND_WIDGET } from "../types"
import { DocumentView } from "../render/DocumentView"
import { widgetLabel } from "../render/widgets"

type PagePayload = {
  id: number
  title: string
  slug: string
  status: string
  document: unknown
}

type TemplatePayload = {
  id?: number
  kind: string
  title: string | null
  document: unknown
}

type Mode =
  | { kind: "page"; id: number | "new" }
  | { kind: "chrome"; chrome: "header" | "footer" }
  | { kind: "theme"; templateKind: string; id: number | "new" }
  | { kind: "product"; id: number }
  | { kind: "post"; id: number }
  | { kind: "article"; id: number }

const DEVICE_WIDTH: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
}

const FIELD_ICONS: Record<string, LucideIcon> = {
  text: Type,
  title: Type,
  label: Type,
  href: Link2,
  src: ImageIcon,
  alt: Type,
  color: Palette,
  tone: Palette,
  tag: Type,
  size: Settings2,
  html: Blocks,
  links: ListTree,
  name: Type,
  submit: MousePointerClick,
}

export function BuilderEditor({ mode }: { mode: Mode }) {
  const t = useTranslations("builder")
  const [doc, setDoc] = useState<BuilderDocument>(emptyDocument())
  const [past, setPast] = useState<BuilderDocument[]>([])
  const [future, setFuture] = useState<BuilderDocument[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<DeviceMode>("desktop")
  const [panel, setPanel] = useState<"widgets" | "navigator">("widgets")
  const [tab, setTab] = useState<"content" | "style">("content")
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [pageId, setPageId] = useState<number | null>(
    mode.kind === "page" && mode.id !== "new" ? mode.id : mode.kind === "theme" && mode.id !== "new" ? mode.id : null,
  )
  const [loading, setLoading] = useState(mode.kind !== "page" || mode.id !== "new")
  const [saving, setSaving] = useState(false)
  const [globals, setGlobals] = useState<BuilderGlobals>(DEFAULT_GLOBALS)
  const [widgetQuery, setWidgetQuery] = useState("")

  const commit = useCallback((next: BuilderDocument) => {
    setPast((items) => [...items.slice(-49), doc])
    setDoc(next)
    setFuture([])
  }, [doc])

  useEffect(() => {
    let cancel = false
    api<{ settings?: unknown }>("/api/v1/builder/globals")
      .then((row) => {
        if (!cancel && row?.settings) setGlobals(asGlobals(row.settings))
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    let cancel = false
    async function load() {
      try {
        if (mode.kind === "chrome") {
          const row = await api<TemplatePayload>(`/api/v1/builder/templates/${mode.chrome}`)
          if (cancel) return
          const initial = isDocument(row.document) && row.document.sections.length
            ? row.document
            : mode.chrome === "header"
              ? ishopHeaderDocument()
              : ishopFooterDocument()
          setDoc(initial)
          setTitle(row.title || (mode.chrome === "header" ? t("header") : t("footer")))
        } else if (mode.kind === "theme") {
          if (mode.id === "new") {
            setTitle(t("create"))
            setDoc(addSection(emptyDocument()))
          } else {
            const row = await api<TemplatePayload>(`/api/v1/theme-builder/templates/${mode.id}`)
            if (cancel) return
            setDoc(isDocument(row.document) ? row.document : emptyDocument())
            setTitle(row.title || t("create"))
            if (row.id) setPageId(row.id)
          }
        } else if (mode.kind === "product" || mode.kind === "post" || mode.kind === "article") {
          const base = mode.kind === "product" ? "products" : mode.kind === "post" ? "posts" : "articles"
          const row = await api<PagePayload>(`/api/v1/builder/${base}/${mode.id}`)
          if (cancel) return
          setDoc(isDocument(row.document) ? row.document : emptyDocument())
          setTitle(row.title)
          setSlug(row.slug)
          setPageId(row.id)
        } else if (mode.id !== "new") {
          const row = await api<PagePayload>(`/api/v1/builder/pages/${mode.id}`)
          if (cancel) return
          setDoc(isDocument(row.document) ? row.document : emptyDocument())
          setTitle(row.title)
          setSlug(row.slug)
          setPageId(row.id)
        } else {
          setTitle(t("create"))
          setSlug("page")
          setDoc(addSection(emptyDocument()))
        }
      } catch {
        if (!cancel) toast.error(t("load_failed"))
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    void load()
    return () => {
      cancel = true
    }
  }, [mode, t])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return
      if (event.key === "z" && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (event.key === "z" && event.shiftKey) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  function undo() {
    setPast((items) => {
      const prev = items[items.length - 1]
      if (!prev) return items
      setFuture((next) => [doc, ...next])
      setDoc(prev)
      return items.slice(0, -1)
    })
  }

  function redo() {
    setFuture((items) => {
      const next = items[0]
      if (!next) return items
      setPast((prev) => [...prev, doc])
      setDoc(next)
      return items.slice(1)
    })
  }

  const editor = useMemo<EditorApi>(() => ({
    selectedId,
    onSelect: setSelectedId,
    onInline: (id, key, value) => {
      commit(updateWidget(doc, id, (widget) => ({ ...widget, props: { ...widget.props, [key]: value } })))
    },
    onDropNew: (columnId, index, type) => {
      const widget = createWidget(type)
      if (!widget) return
      commit(insertWidget(doc, columnId, index, widget))
      setSelectedId(widget.id)
    },
    onDropMove: (columnId, index, nodeId) => {
      commit(moveWidget(doc, nodeId, columnId, index))
    },
    onResize: (columnId, span) => {
      setDoc((current) => resizeColumn(current, columnId, span))
    },
  }), [commit, doc, selectedId])

  function insertFromPalette(type: string) {
    let columnId = defaultColumnId(doc, selectedId)
    let next = doc
    if (!columnId) {
      next = addSection(doc)
      columnId = next.sections[0]?.columns[0]?.id ?? null
    }
    if (!columnId) return
    const widget = createWidget(type)
    if (!widget) return
    const column = defaultColumnId(next, selectedId) ?? columnId
    const selection = findSelection(next, selectedId)
    const index = selection?.kind === "widget"
      ? (next.sections.flatMap((section) => section.columns).find((col) => col.id === column)?.widgets.findIndex((item) => item.id === selection.id) ?? 0) + 1
      : 999
    commit(insertWidget(next, column, index, widget))
    setSelectedId(widget.id)
  }

  async function save(publish: boolean) {
    setSaving(true)
    try {
      if (mode.kind === "chrome") {
        await api(`/api/v1/builder/templates/${mode.chrome}`, {
          method: "PUT",
          json: { title, document: doc },
        })
        if (publish) {
          await api(`/api/v1/builder/templates/${mode.chrome}/publish`, { method: "POST" })
          toast.success(t("published"))
        } else toast.success(t("saved"))
        return
      }
      if (mode.kind === "theme") {
        let id = pageId
        if (!id) {
          const created = await api<TemplatePayload>("/api/v1/theme-builder/templates", {
            method: "POST",
            json: { kind: mode.templateKind, title: title || t("create"), document: doc },
          })
          id = created.id ?? null
          setPageId(id)
          if (id) window.history.replaceState(null, "", `/dashboard/theme-builder/${mode.templateKind}/${id}`)
        } else {
          await api(`/api/v1/theme-builder/templates/${id}`, {
            method: "PATCH",
            json: { title, document: doc },
          })
        }
        if (publish && id) {
          await api(`/api/v1/theme-builder/templates/${id}/publish`, { method: "POST" })
          toast.success(t("published"))
        } else toast.success(t("saved"))
        return
      }
      if (mode.kind === "product" || mode.kind === "post" || mode.kind === "article") {
        const base = mode.kind === "product" ? "products" : mode.kind === "post" ? "posts" : "articles"
        await api(`/api/v1/builder/${base}/${mode.id}`, {
          method: "PATCH",
          json: { title, document: doc },
        })
        if (publish) {
          await api(`/api/v1/builder/${base}/${mode.id}/publish`, { method: "POST" })
          toast.success(t("published"))
        } else toast.success(t("saved"))
        return
      }
      let id = pageId
      if (!id) {
        const created = await api<PagePayload>("/api/v1/builder/pages", {
          method: "POST",
          json: { title: title || t("create"), slug, document: doc },
        })
        id = created.id
        setPageId(id)
        setSlug(created.slug)
        window.history.replaceState(null, "", `/dashboard/builder/${id}`)
      } else {
        await api(`/api/v1/builder/pages/${id}`, {
          method: "PATCH",
          json: { title, slug, document: doc },
        })
      }
      if (publish) {
        await api(`/api/v1/builder/pages/${id}/publish`, { method: "POST" })
        toast.success(t("published"))
      } else toast.success(t("saved"))
    } catch {
      toast.error(t("save_failed"))
    } finally {
      setSaving(false)
    }
  }

  const selection = findSelection(doc, selectedId)
  const preview = mode.kind === "page" ? previewHref(slug || "home") : "/"
  const backHref =
    mode.kind === "theme"
      ? "/dashboard/theme-builder"
      : mode.kind === "product"
        ? `/dashboard/products/${mode.id}`
        : mode.kind === "post"
          ? `/dashboard/blog/posts/${mode.id}`
          : mode.kind === "article"
            ? `/dashboard/magazine/posts/${mode.id}`
            : "/dashboard/builder"
  const needle = widgetQuery.trim()

  if (loading) {
    return <div className="grid h-svh max-h-full min-h-0 place-items-center text-sm text-[#0C2D63]">{t("loading")}</div>
  }

  return (
    <div className="flex h-svh max-h-full min-h-0 flex-col bg-[#101820] text-[#0C2D63]">
      <header className="flex h-14 items-center gap-2 border-b border-white/10 px-3 text-white">
        <Link href={backHref} className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10">{t("back")}</Link>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-8 w-44 rounded-md bg-white/10 px-2 text-sm outline-none" aria-label={t("title")} />
        {mode.kind === "page" ? (
          <input value={slug} onChange={(event) => setSlug(event.target.value)} className="h-8 w-32 rounded-md bg-white/10 px-2 text-xs outline-none" aria-label={t("slug")} />
        ) : null}
        <div className="mx-auto flex items-center gap-1 rounded-full bg-white/5 p-1">
          <IconButton label={t("desktop")} active={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor className="size-4" /></IconButton>
          <IconButton label={t("tablet")} active={device === "tablet"} onClick={() => setDevice("tablet")}><Tablet className="size-4" /></IconButton>
          <IconButton label={t("mobile")} active={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone className="size-4" /></IconButton>
        </div>
        <IconButton label={t("undo")} onClick={undo}><Undo2 className="size-4" /></IconButton>
        <IconButton label={t("redo")} onClick={redo}><Redo2 className="size-4" /></IconButton>
        <Link href="/dashboard/builder/settings" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10">
          <Settings2 className="size-3.5" aria-hidden />
          {t("globals")}
        </Link>
        <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-white/80">{t("preview")}</a>
        <Button type="button" size="sm" variant="outline" className="border-white/20 bg-transparent text-white" disabled={saving} onClick={() => void save(false)}>{t("save")}</Button>
        <Button type="button" size="sm" className="bg-[#E16BA6] text-white hover:bg-[#d45b98]" disabled={saving} onClick={() => void save(true)}>{t("publish")}</Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-e border-[#e6eef6] bg-[#f7f9fc]">
          <div className="flex border-b border-[#e6eef6] text-xs font-semibold">
            <button type="button" className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 ${panel === "widgets" ? "text-[#E16BA6]" : ""}`} onClick={() => setPanel("widgets")}>
              <Blocks className="size-3.5" aria-hidden />
              {t("widgets")}
            </button>
            <button type="button" className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 ${panel === "navigator" ? "text-[#E16BA6]" : ""}`} onClick={() => setPanel("navigator")}>
              <ListTree className="size-3.5" aria-hidden />
              {t("navigator")}
            </button>
          </div>
          {panel === "widgets" ? (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <label className="mb-3 flex items-center gap-2 rounded-xl border border-[#e6eef6] bg-white px-2">
                <Search className="size-3.5 text-[#0C2D63]/40" aria-hidden />
                <input value={widgetQuery} onChange={(event) => setWidgetQuery(event.target.value)} placeholder={t("widget_search")} aria-label={t("widget_search")} className="h-9 w-full bg-transparent text-xs outline-none" />
              </label>
              <Button type="button" variant="outline" className="mb-3 w-full" onClick={() => { commit(addSection(doc)) }}>{t("add_section")}</Button>
              {WIDGET_CATEGORIES.map((category) => {
                const items = WIDGETS.filter((widget) => widget.category === category.id && (!needle || widget.label.includes(needle)))
                if (!items.length) return null
                return (
                  <div key={category.id} className="mb-4">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#0C2D63]/60">
                      <Blocks className="size-3" aria-hidden />
                      {category.label}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {items.map((widget) => (
                        <button
                          key={widget.type}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(DND_WIDGET, widget.type)
                            event.dataTransfer.effectAllowed = "copy"
                          }}
                          onClick={() => insertFromPalette(widget.type)}
                          className="flex flex-col items-center gap-1.5 rounded-xl border border-[#e6eef6] bg-white px-2 py-3 text-xs font-semibold hover:border-[#E16BA6]"
                        >
                          <WidgetGlyph type={widget.type} />
                          <span>{widget.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <nav className="min-h-0 flex-1 overflow-auto p-2 text-sm">
              {doc.sections.map((section, index) => (
                <div key={section.id} className="mb-2 rounded-lg p-1">
                  <button type="button" className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-start font-bold ${selectedId === section.id ? "bg-white text-[#E16BA6]" : ""}`} onClick={() => setSelectedId(section.id)}>
                    <Blocks className="size-3.5" aria-hidden />
                    {t("section")} {index + 1}
                  </button>
                  {section.columns.map((column, colIndex) => (
                    <div key={column.id} className="ms-3">
                      <button type="button" className={`flex items-center gap-1 text-xs ${selectedId === column.id ? "text-[#E16BA6]" : "text-[#0C2D63]/70"}`} onClick={() => setSelectedId(column.id)}>
                        <ListTree className="size-3" aria-hidden />
                        {t("column")} {colIndex + 1}
                      </button>
                      {column.widgets.map((widget) => (
                        <button key={widget.id} type="button" className={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-start hover:bg-white ${selectedId === widget.id ? "bg-white text-[#E16BA6]" : ""}`} onClick={() => setSelectedId(widget.id)}>
                          <WidgetGlyph type={widget.type} className="size-3.5 shrink-0" />
                          <span className="truncate">{widgetLabel(widget)}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </nav>
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto bg-[#d7e0ea] p-6" onClick={() => setSelectedId(null)}>
          <div className="mx-auto min-h-full overflow-hidden rounded-2xl bg-[#f5f8fb] shadow-xl" style={{ width: DEVICE_WIDTH[device] }}>
            {doc.sections.length === 0 ? (
              <div className="grid min-h-80 place-items-center gap-2 text-sm">
                <Blocks className="size-5 text-[#0C2D63]/30" aria-hidden />
                {t("empty")}
              </div>
            ) : (
              <Suspense fallback={null}>
                <DocumentView document={doc} mode="edit" device={device} editor={editor} globals={globals} runtime={{ siteName: title || "ویبینو" }} />
              </Suspense>
            )}
          </div>
        </main>
        <aside className="w-80 shrink-0 overflow-auto border-s border-[#e6eef6] bg-white p-3">
          <div className="mb-3 flex gap-1 rounded-xl bg-[#f7f9fc] p-1 text-xs font-semibold">
            <button type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === "content" ? "bg-white text-[#E16BA6] shadow-sm" : ""}`} onClick={() => setTab("content")}>
              <Type className="size-3.5" aria-hidden />
              {t("content")}
            </button>
            <button type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === "style" ? "bg-white text-[#E16BA6] shadow-sm" : ""}`} onClick={() => setTab("style")}>
              <Paintbrush className="size-3.5" aria-hidden />
              {t("style")}
            </button>
          </div>
          {!selection ? (
            <div className="grid place-items-center gap-2 py-8 text-center text-sm text-[#0C2D63]/60">
              <MousePointerClick className="size-5" aria-hidden />
              {t("no_selection")}
            </div>
          ) : null}
          {selection?.kind === "section" ? (
            <div className="grid gap-2">
              <Button type="button" variant="outline" onClick={() => commit(addColumn(doc, selection.id))}>{t("add_column")}</Button>
              <Button type="button" variant="outline" onClick={() => { commit(removeNode(doc, selection.id)); setSelectedId(null) }}>{t("delete")}</Button>
              {tab === "style" ? (
                <StyleFields
                  device={device}
                  style={mergeStyle(selection.section.style, device)}
                  onChange={(patch) => commit(updateSection(doc, selection.id, (section) => ({
                    ...section,
                    style: { ...section.style, [device === "desktop" ? "base" : device]: { ...mergeStyle(section.style, device), ...patch } },
                  })))}
                />
              ) : null}
            </div>
          ) : null}
          {selection?.kind === "column" ? (
            <label className="grid gap-1 text-xs">
              <span className="flex items-center gap-1.5"><Settings2 className="size-3.5" aria-hidden />{t("span")}</span>
              <input
                type="number"
                min={1}
                max={12}
                value={selection.column.span}
                onChange={(event) => commit(updateColumn(doc, selection.id, (column) => ({ ...column, span: Number(event.target.value) })))}
                className="h-9 rounded-md border px-2"
              />
            </label>
          ) : null}
          {selection?.kind === "widget" ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <WidgetGlyph type={selection.widget.type} />
                {widgetDef(selection.widget.type)?.label ?? selection.widget.type}
              </div>
              {tab === "content" ? (
                <WidgetFields
                  type={selection.widget.type}
                  props={selection.widget.props}
                  onChange={(key, value) => commit(updateWidget(doc, selection.id, (widget) => ({ ...widget, props: { ...widget.props, [key]: value } })))}
                />
              ) : (
                <StyleFields
                  device={device}
                  style={mergeStyle(selection.widget.style, device)}
                  onChange={(patch) => commit(updateWidget(doc, selection.id, (widget) => ({
                    ...widget,
                    style: { ...widget.style, [device === "desktop" ? "base" : device]: { ...mergeStyle(widget.style, device), ...patch } },
                  })))}
                />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => commit(duplicateWidget(doc, selection.id))}>{t("duplicate")}</Button>
                <Button type="button" variant="outline" onClick={() => { commit(removeNode(doc, selection.id)); setSelectedId(null) }}>{t("delete")}</Button>
              </div>
            </div>
          ) : null}
          <p className="mt-6 text-[10px] text-[#0C2D63]/40">{documentCss(doc).length ? t("style_ready") : ""}</p>
        </aside>
      </div>
    </div>
  )
}

function IconButton({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid size-8 place-items-center rounded-full ${active ? "bg-white text-[#0C2D63]" : "text-white hover:bg-white/10"}`}>
      {children}
    </button>
  )
}

function FieldMark({ name }: { name: string }) {
  const Icon = FIELD_ICONS[name] ?? Settings2
  return <Icon className="size-3.5 shrink-0 text-[#0C2D63]/45" aria-hidden />
}

function WidgetFields({ type, props, onChange }: { type: string; props: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const def = widgetDef(type)
  if (!def?.fields.length) return null
  return (
    <div className="grid gap-2">
      {def.fields.map((field) => {
        const value = props[field.key]
        const label = (
          <span className="flex items-center gap-1.5">
            <FieldMark name={field.key} />
            {field.label}
          </span>
        )
        if (field.kind === "textarea") {
          return (
            <label key={field.key} className="grid gap-1 text-xs">
              {label}
              <textarea className="min-h-24 rounded-md border px-2 py-1" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} />
            </label>
          )
        }
        if (field.kind === "select") {
          return (
            <label key={field.key} className="grid gap-1 text-xs">
              {label}
              <select className="h-9 rounded-md border px-2" value={typeof value === "string" ? value : field.options[0]?.value} onChange={(event) => onChange(field.key, event.target.value)}>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )
        }
        if (field.kind === "switch") {
          return (
            <label key={field.key} className="flex items-center justify-between text-xs">
              {label}
              <input type="checkbox" checked={value === true} onChange={(event) => onChange(field.key, event.target.checked)} />
            </label>
          )
        }
        if (field.kind === "number") {
          return (
            <label key={field.key} className="grid gap-1 text-xs">
              {label}
              <input type="number" min={field.min} max={field.max} className="h-9 rounded-md border px-2" value={typeof value === "number" ? value : ""} onChange={(event) => onChange(field.key, Number(event.target.value))} />
            </label>
          )
        }
        return (
          <label key={field.key} className="grid gap-1 text-xs">
            {label}
            <input className="h-9 rounded-md border px-2" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} />
          </label>
        )
      })}
    </div>
  )
}

function StyleFields({ style, onChange, device }: { style: StyleProps; onChange: (patch: StyleProps) => void; device: DeviceMode }) {
  const t = useTranslations("builder")
  return (
    <div className="grid gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-[#0C2D63]/50"><Paintbrush className="size-3.5" aria-hidden />{device}</span>
      <TokenColor label={t("color")} value={style.color} onChange={(color) => onChange({ color })} />
      <TokenColor label={t("background")} value={style.background} onChange={(background) => onChange({ background })} />
      <label className="grid gap-1"><span className="flex items-center gap-1.5"><Type className="size-3.5" aria-hidden />{t("font_size")}</span><input className="h-9 rounded-md border px-2" value={style.fontSize ?? ""} placeholder="1rem" onChange={(event) => onChange({ fontSize: event.target.value })} /></label>
      <label className="grid gap-1"><span className="flex items-center gap-1.5"><Settings2 className="size-3.5" aria-hidden />{t("padding")}</span><input className="h-9 rounded-md border px-2" value={style.padding?.top ?? ""} placeholder="16px" onChange={(event) => onChange({ padding: { top: event.target.value, right: event.target.value, bottom: event.target.value, left: event.target.value } })} /></label>
      <label className="grid gap-1"><span className="flex items-center gap-1.5"><Settings2 className="size-3.5" aria-hidden />{t("radius")}</span><input className="h-9 rounded-md border px-2" value={style.radius ?? ""} placeholder="16px" onChange={(event) => onChange({ radius: event.target.value })} /></label>
      <label className="flex items-center justify-between">{t("hidden")}<input type="checkbox" checked={style.hidden === true} onChange={(event) => onChange({ hidden: event.target.checked })} /></label>
    </div>
  )
}

function TokenColor({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  const token = COLOR_TOKENS.some((item) => item.value && item.value === value) ? value : ""
  return (
    <label className="grid gap-1">
      <span className="flex items-center gap-1.5"><Palette className="size-3.5" aria-hidden />{label}</span>
      <select className="h-9 rounded-md border px-2" value={token ?? ""} onChange={(event) => onChange(event.target.value || "#0C2D63")}>
        {COLOR_TOKENS.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}
      </select>
      {token ? null : (
        <input type="color" value={value && value.startsWith("#") ? value : "#0C2D63"} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}
