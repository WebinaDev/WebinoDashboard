"use client"

import {
  Monitor,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { createWidget, WIDGET_CATEGORIES, WIDGETS, widgetDef } from "../registry"
import { documentCss, mergeStyle } from "../style"
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
  kind: string
  title: string | null
  document: unknown
}

type Mode =
  | { kind: "page"; id: number | "new" }
  | { kind: "chrome"; chrome: "header" | "footer" }

const DEVICE_WIDTH: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
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
  const [pageId, setPageId] = useState<number | null>(mode.kind === "page" && mode.id !== "new" ? mode.id : null)
  const [loading, setLoading] = useState(mode.kind === "chrome" || (mode.kind === "page" && mode.id !== "new"))
  const [saving, setSaving] = useState(false)

  const commit = useCallback((next: BuilderDocument) => {
    setPast((items) => [...items.slice(-49), doc])
    setDoc(next)
    setFuture([])
  }, [doc])

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

  if (loading) {
    return <div className="grid h-svh place-items-center text-sm text-[#0C2D63]">{t("loading")}</div>
  }

  return (
    <div className="flex h-svh flex-col bg-[#101820] text-[#0C2D63]">
      <header className="flex h-12 items-center gap-2 border-b border-white/10 px-3 text-white">
        <Link href="/dashboard/builder" className="text-xs text-white/70">{t("back")}</Link>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-8 w-40 rounded-md bg-white/10 px-2 text-sm outline-none" aria-label={t("title")} />
        {mode.kind === "page" ? (
          <input value={slug} onChange={(event) => setSlug(event.target.value)} className="h-8 w-32 rounded-md bg-white/10 px-2 text-xs outline-none" aria-label={t("slug")} />
        ) : null}
        <div className="mx-auto flex items-center gap-1">
          <IconButton label={t("desktop")} active={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor className="size-4" /></IconButton>
          <IconButton label={t("tablet")} active={device === "tablet"} onClick={() => setDevice("tablet")}><Tablet className="size-4" /></IconButton>
          <IconButton label={t("mobile")} active={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone className="size-4" /></IconButton>
        </div>
        <IconButton label={t("undo")} onClick={undo}><Undo2 className="size-4" /></IconButton>
        <IconButton label={t("redo")} onClick={redo}><Redo2 className="size-4" /></IconButton>
        <Button type="button" size="sm" variant="outline" className="border-white/20 bg-transparent text-white" onClick={() => setPanel(panel === "navigator" ? "widgets" : "navigator")}>
          {t("navigator")}
        </Button>
        <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-white/80">{t("preview")}</a>
        <Button type="button" size="sm" variant="outline" className="border-white/20 bg-transparent text-white" disabled={saving} onClick={() => void save(false)}>{t("save")}</Button>
        <Button type="button" size="sm" className="bg-[#E16BA6] text-white hover:bg-[#d45b98]" disabled={saving} onClick={() => void save(true)}>{t("publish")}</Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-e border-[#e6eef6] bg-[#f7f9fc]">
          <div className="flex border-b border-[#e6eef6] text-xs font-semibold">
            <button type="button" className={`flex-1 py-2 ${panel === "widgets" ? "text-[#E16BA6]" : ""}`} onClick={() => setPanel("widgets")}>{t("widgets")}</button>
            <button type="button" className={`flex-1 py-2 ${panel === "navigator" ? "text-[#E16BA6]" : ""}`} onClick={() => setPanel("navigator")}>{t("navigator")}</button>
          </div>
          {panel === "widgets" ? (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <Button type="button" variant="outline" className="mb-3 w-full" onClick={() => { commit(addSection(doc)); }}>{t("add_section")}</Button>
              {WIDGET_CATEGORIES.map((category) => (
                <div key={category.id} className="mb-4">
                  <div className="mb-2 text-[11px] font-bold text-[#0C2D63]/60">{category.label}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {WIDGETS.filter((widget) => widget.category === category.id).map((widget) => (
                      <button
                        key={widget.type}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(DND_WIDGET, widget.type)
                          event.dataTransfer.effectAllowed = "copy"
                        }}
                        onClick={() => insertFromPalette(widget.type)}
                        className="rounded-xl border border-[#e6eef6] bg-white px-2 py-3 text-xs font-semibold hover:border-[#E16BA6]"
                      >
                        {widget.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <nav className="min-h-0 flex-1 overflow-auto p-2 text-sm">
              {doc.sections.map((section, index) => (
                <div key={section.id} className="mb-2">
                  <button type="button" className="font-bold" onClick={() => setSelectedId(section.id)}>{t("section")} {index + 1}</button>
                  {section.columns.map((column, colIndex) => (
                    <div key={column.id} className="ms-3">
                      <button type="button" className="text-xs text-[#0C2D63]/70" onClick={() => setSelectedId(column.id)}>{t("column")} {colIndex + 1}</button>
                      {column.widgets.map((widget) => (
                        <button key={widget.id} type="button" className="block w-full truncate rounded px-2 py-1 text-start hover:bg-white" onClick={() => setSelectedId(widget.id)}>
                          {widgetLabel(widget)}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </nav>
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto bg-[#dfe7f1] p-6" onClick={() => setSelectedId(null)}>
          <div className="mx-auto min-h-full bg-[#f5f8fb] shadow-xl" style={{ width: DEVICE_WIDTH[device] }}>
            {doc.sections.length === 0 ? (
              <div className="grid min-h-80 place-items-center text-sm">{t("empty")}</div>
            ) : (
              <Suspense fallback={null}>
              <DocumentView document={doc} mode="edit" device={device} editor={editor} runtime={{ siteName: title || "ویبینو" }} />
            </Suspense>
            )}
          </div>
        </main>
        <aside className="w-80 shrink-0 overflow-auto border-s border-[#e6eef6] bg-white p-3">
          <div className="mb-3 flex gap-2 text-xs font-semibold">
            <button type="button" className={tab === "content" ? "text-[#E16BA6]" : ""} onClick={() => setTab("content")}>{t("content")}</button>
            <button type="button" className={tab === "style" ? "text-[#E16BA6]" : ""} onClick={() => setTab("style")}>{t("style")}</button>
          </div>
          {!selection ? <p className="text-sm text-[#0C2D63]/60">{t("no_selection")}</p> : null}
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
              {t("span")}
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
              <div className="text-sm font-bold">{widgetDef(selection.widget.type)?.label ?? selection.widget.type}</div>
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
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid size-8 place-items-center rounded-md ${active ? "bg-white text-[#0C2D63]" : "text-white hover:bg-white/10"}`}>
      {children}
    </button>
  )
}

function WidgetFields({ type, props, onChange }: { type: string; props: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const def = widgetDef(type)
  if (!def?.fields.length) return null
  return (
    <div className="grid gap-2">
      {def.fields.map((field) => {
        const value = props[field.key]
        if (field.kind === "textarea") {
          return (
            <label key={field.key} className="grid gap-1 text-xs">
              {field.label}
              <textarea className="min-h-24 rounded-md border px-2 py-1" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.key, event.target.value)} />
            </label>
          )
        }
        if (field.kind === "select") {
          return (
            <label key={field.key} className="grid gap-1 text-xs">
              {field.label}
              <select className="h-9 rounded-md border px-2" value={typeof value === "string" ? value : field.options[0]?.value} onChange={(event) => onChange(field.key, event.target.value)}>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )
        }
        if (field.kind === "switch") {
          return (
            <label key={field.key} className="flex items-center justify-between text-xs">
              {field.label}
              <input type="checkbox" checked={value === true} onChange={(event) => onChange(field.key, event.target.checked)} />
            </label>
          )
        }
        if (field.kind === "number") {
          return (
            <label key={field.key} className="grid gap-1 text-xs">
              {field.label}
              <input type="number" min={field.min} max={field.max} className="h-9 rounded-md border px-2" value={typeof value === "number" ? value : ""} onChange={(event) => onChange(field.key, Number(event.target.value))} />
            </label>
          )
        }
        return (
          <label key={field.key} className="grid gap-1 text-xs">
            {field.label}
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
      <span className="text-[#0C2D63]/50">{device}</span>
      <label className="grid gap-1">{t("color")}<input type="color" value={style.color || "#0C2D63"} onChange={(event) => onChange({ color: event.target.value })} /></label>
      <label className="grid gap-1">{t("background")}<input type="color" value={style.background || "#ffffff"} onChange={(event) => onChange({ background: event.target.value })} /></label>
      <label className="grid gap-1">{t("font_size")}<input className="h-9 rounded-md border px-2" value={style.fontSize ?? ""} placeholder="1rem" onChange={(event) => onChange({ fontSize: event.target.value })} /></label>
      <label className="grid gap-1">{t("padding")}<input className="h-9 rounded-md border px-2" value={style.padding?.top ?? ""} placeholder="16px" onChange={(event) => onChange({ padding: { top: event.target.value, right: event.target.value, bottom: event.target.value, left: event.target.value } })} /></label>
      <label className="grid gap-1">{t("radius")}<input className="h-9 rounded-md border px-2" value={style.radius ?? ""} placeholder="16px" onChange={(event) => onChange({ radius: event.target.value })} /></label>
      <label className="flex items-center justify-between">{t("hidden")}<input type="checkbox" checked={style.hidden === true} onChange={(event) => onChange({ hidden: event.target.checked })} /></label>
    </div>
  )
}
