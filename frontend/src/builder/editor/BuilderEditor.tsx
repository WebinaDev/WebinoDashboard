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
  History,
  Download,
  Keyboard,
  LayoutTemplate,
  Lock,
  Upload,
  ZoomIn,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { asGlobals, COLOR_TOKENS, DEFAULT_GLOBALS, type BuilderGlobals } from "../globals"
import { createWidget, WIDGET_CATEGORIES, WIDGETS, widgetDef } from "../registry"
import { documentCss, mergeStyle } from "../style"
import { WidgetGlyph } from "../theme/icons"
import {
  classicFooterDocument,
  classicHeaderDocument,
  previewHref,
} from "../templates/classic"
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
import type { FieldDef, AdvancedProps, BoxEdges, BuilderDocument, DeviceMode, EditorApi, StyleProps } from "../types"
import { DND_WIDGET } from "../types"
import { DocumentView } from "../render/DocumentView"
import { migrateDocument } from "../migrate"
import { DynamicEditor, DynamicToggle, EXTENDED_KINDS, ExtendedField } from "./fields"
import { isDynamic } from "../dynamic"
import { ContextMenu, type MenuItem } from "./ContextMenu"
import { ConditionsFields } from "./ConditionsFields"
import { FormActionsPanel } from "./FormActionsPanel"
import { LibraryPanel } from "./LibraryPanel"
import { propStr } from "../props"
import { Navigator } from "./Navigator"
import { ShortcutHelp } from "./ShortcutHelp"
import { CLIPBOARD_KEY, duplicateSection, exportPayload, findNode, importPayload, isLocked, makeClip, parseClip, pasteClip, pasteStyle, patchNode, type Clip } from "../ops"
import { RevisionsPanel, type RevisionTarget } from "./RevisionsPanel"
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
  const [panel, setPanel] = useState<"widgets" | "navigator" | "library">("widgets")
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [libraryKey, setLibraryKey] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<"content" | "style" | "advanced">("content")
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [pageId, setPageId] = useState<number | null>(
    mode.kind === "page" && mode.id !== "new" ? mode.id : mode.kind === "theme" && mode.id !== "new" ? mode.id : null,
  )
  const [loading, setLoading] = useState(mode.kind !== "page" || mode.id !== "new")
  const [saving, setSaving] = useState(false)
  const [globals, setGlobals] = useState<BuilderGlobals>(DEFAULT_GLOBALS)
  const [widgetQuery, setWidgetQuery] = useState("")
  const [chromeId, setChromeId] = useState<number | null>(null)
  const [showRevisions, setShowRevisions] = useState(false)
  /** JSON of the last loaded/saved document; null until the first load completes. */
  const [savedJson, setSavedJson] = useState<string | null>(null)
  const docJson = useMemo(() => JSON.stringify(doc), [doc])
  const dirty = !loading && savedJson !== null && docJson !== savedJson
  if (!loading && savedJson === null) setSavedJson(docJson)

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
              ? classicHeaderDocument()
              : classicFooterDocument()
          setDoc(migrateDocument(initial))
          setTitle(row.title || (mode.chrome === "header" ? t("header") : t("footer")))
          setChromeId(row.id ?? null)
        } else if (mode.kind === "theme") {
          if (mode.id === "new") {
            setTitle(t("create"))
            setDoc(addSection(emptyDocument()))
          } else {
            const row = await api<TemplatePayload>(`/api/v1/theme-builder/templates/${mode.id}`)
            if (cancel) return
            setDoc(isDocument(row.document) ? migrateDocument(row.document) : emptyDocument())
            setTitle(row.title || t("create"))
            if (row.id) setPageId(row.id)
          }
        } else if (mode.kind === "product" || mode.kind === "post" || mode.kind === "article") {
          const base = mode.kind === "product" ? "products" : mode.kind === "post" ? "posts" : "articles"
          const row = await api<PagePayload>(`/api/v1/builder/${base}/${mode.id}`)
          if (cancel) return
          setDoc(isDocument(row.document) ? migrateDocument(row.document) : emptyDocument())
          setTitle(row.title)
          setSlug(row.slug)
          setPageId(row.id)
        } else if (mode.id !== "new") {
          const row = await api<PagePayload>(`/api/v1/builder/pages/${mode.id}`)
          if (cancel) return
          setDoc(isDocument(row.document) ? migrateDocument(row.document) : emptyDocument())
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

  /* ---------- node actions (shared by shortcuts, context menu and inspector) ---------- */

  function readClip(): Clip | null {
    try {
      return parseClip(window.localStorage.getItem(CLIPBOARD_KEY))
    } catch {
      return null
    }
  }

  function copyNode(id: string, cut = false) {
    const clip = makeClip(doc, id)
    if (!clip) return
    try {
      window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clip))
    } catch {
      toast.error(t("clipboard_failed"))
      return
    }
    if (cut && !isLocked(doc, id)) {
      commit(removeNode(doc, id))
      setSelectedId(null)
    } else toast.success(t("copied"))
  }

  function pasteNode() {
    const clip = readClip()
    if (!clip) {
      toast.error(t("clipboard_empty"))
      return
    }
    const result = pasteClip(doc, clip, selectedId)
    commit(result.doc)
    setSelectedId(result.id)
  }

  function pasteStyleOn(id: string) {
    const clip = readClip()
    if (!clip || isLocked(doc, id)) return
    commit(pasteStyle(doc, id, clip))
  }

  function duplicateNode(id: string) {
    const hit = findNode(doc, id)
    if (!hit || isLocked(doc, id)) return
    if (hit.kind === "widget") commit(duplicateWidget(doc, id))
    else if (hit.kind === "section") {
      const result = duplicateSection(doc, id)
      if (result.id) {
        commit(result.doc)
        setSelectedId(result.id)
      }
    }
  }

  function deleteNode(id: string) {
    if (isLocked(doc, id)) {
      toast.error(t("node_locked"))
      return
    }
    commit(removeNode(doc, id))
    setSelectedId(null)
  }

  async function saveToLibrary(id: string | null) {
    const hit = id ? findNode(doc, id) : null
    const kind = !hit ? "page" : hit.kind === "widget" ? "widget" : "section"
    const name = window.prompt(t("library_name_prompt"), hit?.node.label ?? title)
    if (!name?.trim()) return
    let payload: BuilderDocument = doc
    if (hit?.kind === "widget") payload = { version: 2, sections: [{ id: "lib", columns: [{ id: "lib-c", span: 12, widgets: [hit.node] }] }] }
    else if (hit) {
      const clip = makeClip(doc, hit.node.id)
      if (clip?.kind === "section") payload = { version: 2, sections: [clip.node] }
    }
    try {
      await api("/api/v1/builder/library", { method: "POST", json: { kind, title: name.trim(), document: payload } })
      toast.success(t("library_saved"))
      setLibraryKey((key) => key + 1)
    } catch {
      toast.error(t("save_failed"))
    }
  }

  function insertLibrary(part: BuilderDocument, kind: string) {
    if (kind === "widget") {
      const widget = part.sections[0]?.columns[0]?.widgets[0]
      if (!widget) return
      const result = pasteClip(doc, { v: 1, kind: "widget", node: widget }, selectedId)
      commit(result.doc)
      setSelectedId(result.id)
      return
    }
    const selection = findSelection(doc, selectedId)
    const at = selection?.kind === "section" ? doc.sections.findIndex((item) => item.id === selection.id) + 1 : doc.sections.length
    const sections = [...doc.sections]
    sections.splice(at < 0 ? sections.length : at, 0, ...part.sections)
    commit({ ...doc, sections })
    setSelectedId(part.sections[0]?.id ?? null)
  }

  function exportJson() {
    const blob = new Blob([exportPayload(doc, title)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${(slug || title || "builder").replace(/[^\p{L}\p{N}_-]+/gu, "-")}.webino.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importJson(file: File) {
    if (file.size > 2_000_000) {
      toast.error(t("import_too_large"))
      return
    }
    const imported = importPayload(await file.text())
    if (!imported) {
      toast.error(t("import_invalid"))
      return
    }
    const replace = doc.sections.length === 0 || window.confirm(t("import_replace_confirm"))
    commit(replace ? imported : { ...doc, sections: [...doc.sections, ...imported.sections] })
    toast.success(t("imported"))
  }

  // Central keyboard shortcuts (ignored while typing in inputs / inline text).
  useEffect(() => {
    function typing(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
    }
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (meta && key === "s") {
        event.preventDefault()
        void save(event.shiftKey)
        return
      }
      if (typing(event.target)) return
      if (meta && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (meta && key === "y") {
        event.preventDefault()
        redo()
      } else if (meta && key === "c" && selectedId) {
        event.preventDefault()
        copyNode(selectedId)
      } else if (meta && key === "x" && selectedId) {
        event.preventDefault()
        copyNode(selectedId, true)
      } else if (meta && key === "v" && event.shiftKey && selectedId) {
        event.preventDefault()
        pasteStyleOn(selectedId)
      } else if (meta && key === "v") {
        event.preventDefault()
        pasteNode()
      } else if (meta && key === "d" && selectedId) {
        event.preventDefault()
        duplicateNode(selectedId)
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault()
        deleteNode(selectedId)
      } else if (event.key === "Escape") {
        setSelectedId(null)
        setMenu(null)
      } else if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        setShowHelp(true)
      } else if (meta && key === "p") {
        event.preventDefault()
        setDevice((current) => (current === "desktop" ? "tablet" : current === "tablet" ? "mobile" : "desktop"))
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
    onContextMenu: (id, x, y) => {
      setSelectedId(id)
      setMenu({ id, x, y })
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

  const revisionTarget: RevisionTarget | null =
    mode.kind === "chrome"
      ? chromeId ? { type: "template", id: chromeId } : null
      : mode.kind === "theme"
        ? pageId ? { type: "template", id: pageId } : null
        : mode.kind === "post"
          ? { type: "post", id: Number(mode.id) }
          : mode.kind === "page"
            ? pageId ? { type: "page", id: pageId } : null
            : null

  // Unsaved-changes warning when leaving / reloading the tab.
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  // Autosave: 30s after the last change, only for documents that already exist server-side.
  const saveRef = useRef<(publish: boolean, autosave?: boolean) => Promise<void>>(async () => undefined)
  const canAutosave = mode.kind !== "chrome" && (mode.kind !== "theme" || pageId !== null) && (mode.kind !== "page" || pageId !== null)
  useEffect(() => {
    if (!dirty || !canAutosave) return
    const timer = window.setTimeout(() => void saveRef.current(false, true), 30_000)
    return () => window.clearTimeout(timer)
  }, [canAutosave, dirty, docJson])

  async function save(publish: boolean, autosave = false) {
    if (autosave && saving) return
    const snapshot = docJson
    setSaving(true)
    try {
      if (mode.kind === "chrome") {
        await api(`/api/v1/builder/templates/${mode.chrome}`, {
          method: "PUT",
          json: { title, document: doc, ...(autosave ? { autosave: true } : {}) },
        })
        if (publish) {
          await api(`/api/v1/builder/templates/${mode.chrome}/publish`, { method: "POST" })
          toast.success(t("published"))
        } else if (!autosave) toast.success(t("saved"))
        setSavedJson(snapshot)
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
            json: { title, document: doc, ...(autosave ? { autosave: true } : {}) },
          })
        }
        if (publish && id) {
          await api(`/api/v1/theme-builder/templates/${id}/publish`, { method: "POST" })
          toast.success(t("published"))
        } else if (!autosave) toast.success(t("saved"))
        setSavedJson(snapshot)
        return
      }
      if (mode.kind === "product" || mode.kind === "post" || mode.kind === "article") {
        const base = mode.kind === "product" ? "products" : mode.kind === "post" ? "posts" : "articles"
        await api(`/api/v1/builder/${base}/${mode.id}`, {
          method: "PATCH",
          json: { title, document: doc, ...(autosave ? { autosave: true } : {}) },
        })
        if (publish) {
          await api(`/api/v1/builder/${base}/${mode.id}/publish`, { method: "POST" })
          toast.success(t("published"))
        } else if (!autosave) toast.success(t("saved"))
        setSavedJson(snapshot)
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
          json: { title, slug, document: doc, ...(autosave ? { autosave: true } : {}) },
        })
      }
      if (publish) {
        await api(`/api/v1/builder/pages/${id}/publish`, { method: "POST" })
        toast.success(t("published"))
      } else if (!autosave) toast.success(t("saved"))
      setSavedJson(snapshot)
    } catch {
      if (!autosave) toast.error(t("save_failed"))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    saveRef.current = save
  })

  function nodeMenu(id: string): MenuItem[] {
    const hit = findNode(doc, id)
    const locked = isLocked(doc, id)
    const hasClip = Boolean(readClip())
    const meta = hit?.node ?? {}
    return [
      { id: "edit", label: t("menu_edit"), onSelect: () => { setSelectedId(id); setTab("content") } },
      { id: "duplicate", label: t("duplicate"), shortcut: "Ctrl+D", disabled: locked || hit?.kind === "column", onSelect: () => duplicateNode(id) },
      "sep",
      { id: "copy", label: t("copy"), shortcut: "Ctrl+C", onSelect: () => copyNode(id) },
      { id: "cut", label: t("cut"), shortcut: "Ctrl+X", disabled: locked, onSelect: () => copyNode(id, true) },
      { id: "paste", label: t("paste"), shortcut: "Ctrl+V", disabled: !hasClip, onSelect: pasteNode },
      { id: "paste-style", label: t("paste_style"), shortcut: "Ctrl+Shift+V", disabled: !hasClip || locked, onSelect: () => pasteStyleOn(id) },
      { id: "reset-style", label: t("reset_style"), disabled: locked, onSelect: () => commit(patchNode(doc, id, { style: undefined })) },
      "sep",
      { id: "hide", label: "hidden" in meta && meta.hidden ? t("show_node") : t("hide_node"), onSelect: () => commit(patchNode(doc, id, { hidden: "hidden" in meta && meta.hidden ? undefined : true })) },
      { id: "lock", label: "locked" in meta && meta.locked ? t("unlock_node") : t("lock_node"), onSelect: () => commit(patchNode(doc, id, { locked: "locked" in meta && meta.locked ? undefined : true })) },
      { id: "navigator", label: t("navigator"), onSelect: () => { setPanel("navigator"); setSelectedId(id) } },
      { id: "save-template", label: t("save_as_template"), onSelect: () => void saveToLibrary(id) },
      "sep",
      { id: "delete", label: t("delete"), shortcut: "Del", danger: true, disabled: locked, onSelect: () => deleteNode(id) },
    ]
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
        <label className="flex items-center gap-1 text-[11px] text-white/70" title={t("zoom")}>
          <ZoomIn className="size-3.5" aria-hidden />
          <select aria-label={t("zoom")} className="rounded bg-transparent text-white" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {[50, 75, 90, 100, 125].map((value) => <option key={value} value={value} className="text-black">{value}٪</option>)}
          </select>
        </label>
        <IconButton label={t("export_json")} onClick={exportJson}><Download className="size-4" /></IconButton>
        <IconButton label={t("import_json")} onClick={() => importRef.current?.click()}><Upload className="size-4" /></IconButton>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void importJson(file)
          }}
        />
        <IconButton label={t("save_page_template")} onClick={() => void saveToLibrary(null)}><LayoutTemplate className="size-4" /></IconButton>
        <IconButton label={t("shortcuts")} onClick={() => setShowHelp(true)}><Keyboard className="size-4" /></IconButton>
        {revisionTarget ? (
          <IconButton label={t("revisions")} onClick={() => setShowRevisions(true)}><History className="size-4" /></IconButton>
        ) : null}
        <span className="text-[11px] text-white/60" aria-live="polite">{saving ? t("saving") : dirty ? t("unsaved") : t("all_saved")}</span>
        <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-white/80">{t("preview")}</a>
        <Button type="button" size="sm" variant="outline" className="border-white/20 bg-transparent text-white" disabled={saving} onClick={() => void save(false)}>{t("save")}</Button>
        <Button type="button" size="sm" className="bg-[#E16BA6] text-white hover:bg-[#d45b98]" disabled={saving} onClick={() => void save(true)}>{t("publish")}</Button>
      </header>
      {showRevisions && revisionTarget ? (
        <RevisionsPanel
          target={revisionTarget}
          globals={globals}
          onClose={() => setShowRevisions(false)}
          onRestored={(restored) => {
            commit(restored)
            setSavedJson(JSON.stringify(restored))
          }}
        />
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={nodeMenu(menu.id)}
        />
      ) : null}
      {showHelp ? <ShortcutHelp onClose={() => setShowHelp(false)} /> : null}
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
            <button type="button" className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 ${panel === "library" ? "text-[#E16BA6]" : ""}`} onClick={() => setPanel("library")}>
              <LayoutTemplate className="size-3.5" aria-hidden />
              {t("library")}
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
            panel === "navigator" ? (
              <Navigator doc={doc} selectedId={selectedId} onSelect={setSelectedId} commit={commit} onContextMenu={(id, x, y) => { setSelectedId(id); setMenu({ id, x, y }) }} />
            ) : (
              <LibraryPanel refreshKey={libraryKey} onInsert={insertLibrary} />
            )
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto bg-[#d7e0ea] p-6" onClick={() => setSelectedId(null)}>
          <div className="mx-auto min-h-full overflow-hidden rounded-2xl bg-[#f5f8fb] shadow-xl" style={{ width: DEVICE_WIDTH[device], zoom: zoom / 100 }}>
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
            <button type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === "advanced" ? "bg-white text-[#E16BA6] shadow-sm" : ""}`} onClick={() => setTab("advanced")}>
              <Settings2 className="size-3.5" aria-hidden />
              {t("advanced")}
            </button>
          </div>
          {!selection ? (
            <div className="grid place-items-center gap-2 py-8 text-center text-sm text-[#0C2D63]/60">
              <MousePointerClick className="size-5" aria-hidden />
              {t("no_selection")}
            </div>
          ) : null}
          {selection && isLocked(doc, selection.id) ? (
            <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-[#e6eef6] bg-[#f7f9fc] p-2 text-[11px]">
              <Lock className="size-3.5" aria-hidden />
              {t("node_locked")}
            </div>
          ) : null}
          {selection?.kind === "section" ? (
            <div className="grid gap-2">
              <Button type="button" variant="outline" onClick={() => void saveToLibrary(selection.id)}>{t("save_as_template")}</Button>
              <Button type="button" variant="outline" onClick={() => commit(addColumn(doc, selection.id))}>{t("add_column")}</Button>
              <Button type="button" variant="outline" onClick={() => deleteNode(selection.id)}>{t("delete")}</Button>
              {selection.section.legacy ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-5">
                  {t("legacy_section_note")}
                  <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => commit(updateSection(doc, selection.id, (section) => ({ ...section, legacy: false })))}>
                    {t("upgrade_section")}
                  </Button>
                </div>
              ) : null}
              {tab === "style" ? (
                <StyleFields
                  layout={!selection.section.legacy}
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
            <div className="grid gap-3">
              <label className="grid gap-1 text-xs">
                <span className="flex items-center gap-1.5"><Settings2 className="size-3.5" aria-hidden />{t("span")} · {t(device)}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={device === "desktop" ? selection.column.span : device === "tablet" ? selection.column.tabletSpan ?? selection.column.span : selection.column.mobileSpan ?? 12}
                  onChange={(event) => {
                    const value = Math.min(12, Math.max(1, Number(event.target.value) || 1))
                    const key = device === "desktop" ? "span" : device === "tablet" ? "tabletSpan" : "mobileSpan"
                    commit(updateColumn(doc, selection.id, (column) => ({ ...column, [key]: value })))
                  }}
                  className="h-9 rounded-md border px-2"
                />
              </label>
              {tab === "style" ? (
                <StyleFields
                  layout
                  device={device}
                  style={mergeStyle(selection.column.style, device)}
                  onChange={(patch) => commit(updateColumn(doc, selection.id, (column) => ({
                    ...column,
                    style: { ...column.style, [device === "desktop" ? "base" : device]: { ...mergeStyle(column.style, device), ...patch } },
                  })))}
                />
              ) : null}
            </div>
          ) : null}
          {selection?.kind === "widget" ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <WidgetGlyph type={selection.widget.type} />
                {widgetDef(selection.widget.type)?.label ?? selection.widget.type}
              </div>
              {tab === "content" && selection.widget.type === "form" ? (
                <FormActionsPanel formKey={propStr(selection.widget.props, "formKey", "") || propStr(selection.widget.props, "title", "contact") || "contact"} />
              ) : null}
              {tab === "content" ? (
                <WidgetFields
                  type={selection.widget.type}
                  props={selection.widget.props}
                  onChange={(key, value) => commit(updateWidget(doc, selection.id, (widget) => ({ ...widget, props: { ...widget.props, [key]: value } })))}
                />
              ) : tab === "advanced" ? (
                <AdvancedFields
                  value={selection.widget.advanced ?? {}}
                  onChange={(patch) => commit(updateWidget(doc, selection.id, (widget) => ({ ...widget, advanced: { ...(widget.advanced ?? {}), ...patch } })))}
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
                <Button type="button" variant="outline" onClick={() => duplicateNode(selection.id)}>{t("duplicate")}</Button>
                <Button type="button" variant="outline" onClick={() => deleteNode(selection.id)}>{t("delete")}</Button>
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
      {def.fields.map((rawField) => {
        // Bounded numbers render as sliders.
        const field: FieldDef =
          rawField.kind === "number" && rawField.min !== undefined && rawField.max !== undefined && rawField.max - rawField.min <= 100
            ? { kind: "slider", key: rawField.key, label: rawField.label, min: rawField.min, max: rawField.max }
            : rawField
        const value = props[field.key]
        const label = (
          <span className="flex items-center gap-1.5">
            <FieldMark name={field.key} />
            {field.label}
            <DynamicToggle field={field} value={value} onChange={onChange} />
          </span>
        )
        if (isDynamic(value)) {
          return (
            <div key={field.key} className="grid gap-1 text-xs">
              {label}
              <DynamicEditor field={field} binding={value.dynamic} onChange={(binding) => onChange(field.key, { dynamic: binding })} />
            </div>
          )
        }
        if (EXTENDED_KINDS.has(field.kind)) {
          return (
            <div key={field.key} className="grid gap-1 text-xs">
              {label}
              <ExtendedField field={field} props={props} onChange={onChange} />
            </div>
          )
        }
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

function Edges({ label, value, onChange }: { label: string; value?: BoxEdges; onChange: (edges: BoxEdges) => void }) {
  const sides = ["top", "right", "bottom", "left"] as const
  return (
    <div className="grid gap-1">
      <span className="flex items-center gap-1.5"><Settings2 className="size-3.5" aria-hidden />{label}</span>
      <div className="grid grid-cols-4 gap-1" dir="ltr">
        {sides.map((side) => (
          <input
            key={side}
            className="h-8 min-w-0 rounded-md border px-1 text-center"
            value={value?.[side] ?? ""}
            placeholder={side[0].toUpperCase()}
            aria-label={`${label} ${side}`}
            onChange={(event) => onChange({ ...(value ?? {}), [side]: event.target.value })}
          />
        ))}
      </div>
    </div>
  )
}

function TextIn({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span>{label}</span>
      <input className="h-9 rounded-md border px-2" dir="ltr" value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function SelectIn({ label, value, options, onChange }: { label: string; value?: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span>{label}</span>
      <select className="h-9 rounded-md border px-2" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="rounded-lg border border-[#e6eef6] p-2">
      <summary className="cursor-pointer text-[11px] font-bold text-[#0C2D63]/70">{title}</summary>
      <div className="mt-2 grid gap-2">{children}</div>
    </details>
  )
}

const SHADOWS = [
  { value: "", label: "—" },
  { value: "0 1px 3px rgba(12,45,99,.12)", label: "S" },
  { value: "0 6px 18px rgba(12,45,99,.14)", label: "M" },
  { value: "0 18px 40px rgba(12,45,99,.18)", label: "L" },
]

function StyleFields({ style, onChange, device, layout = false }: { style: StyleProps; onChange: (patch: StyleProps) => void; device: DeviceMode; layout?: boolean }) {
  const t = useTranslations("builder")
  const opt = (values: string[]) => [{ value: "", label: "—" }, ...values.map((v) => ({ value: v, label: v }))]
  return (
    <div className="grid gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-[#0C2D63]/50"><Paintbrush className="size-3.5" aria-hidden />{t(device)}</span>
      {layout ? (
        <Group title={t("style_layout")}>
          <SelectIn label={t("layout_display")} value={style.display} options={[{ value: "", label: t("layout_default") }, { value: "flex", label: "Flexbox" }, { value: "grid", label: "Grid" }, { value: "block", label: t("layout_block") }]} onChange={(v) => onChange({ display: (v || undefined) as StyleProps["display"] })} />
          {style.display === "flex" ? (
            <>
              <SelectIn label={t("layout_direction")} value={style.flexDirection} options={opt(["row", "row-reverse", "column", "column-reverse"])} onChange={(v) => onChange({ flexDirection: (v || undefined) as StyleProps["flexDirection"] })} />
              <SelectIn label={t("layout_wrap")} value={style.flexWrap} options={opt(["nowrap", "wrap", "wrap-reverse"])} onChange={(v) => onChange({ flexWrap: (v || undefined) as StyleProps["flexWrap"] })} />
            </>
          ) : null}
          {style.display === "grid" ? (
            <>
              <TextIn label={t("layout_grid_columns")} value={style.gridColumns} placeholder="3 / 2fr 1fr" onChange={(gridColumns) => onChange({ gridColumns })} />
              <TextIn label={t("layout_grid_rows")} value={style.gridRows} placeholder="auto" onChange={(gridRows) => onChange({ gridRows })} />
            </>
          ) : null}
          {style.display === "flex" || style.display === "grid" ? (
            <>
              <SelectIn label={t("layout_justify")} value={style.justifyContent} options={opt(["start", "center", "end", "space-between", "space-around", "space-evenly", "stretch"])} onChange={(v) => onChange({ justifyContent: (v || undefined) as StyleProps["justifyContent"] })} />
              <SelectIn label={t("layout_align")} value={style.alignItems} options={opt(["start", "center", "end", "stretch", "baseline"])} onChange={(v) => onChange({ alignItems: (v || undefined) as StyleProps["alignItems"] })} />
            </>
          ) : null}
          <TextIn label={t("layout_row_gap")} value={style.rowGap} placeholder="16px" onChange={(rowGap) => onChange({ rowGap })} />
          <TextIn label={t("layout_column_gap")} value={style.columnGap} placeholder="16px" onChange={(columnGap) => onChange({ columnGap })} />
        </Group>
      ) : null}
      <Group title={t("style_typography")}>
        <TokenColor label={t("color")} value={style.color} onChange={(color) => onChange({ color })} />
        <TextIn label={t("font_size")} value={style.fontSize} placeholder="1rem" onChange={(fontSize) => onChange({ fontSize })} />
        <SelectIn label={t("font_weight")} value={style.fontWeight} options={[{ value: "", label: "—" }, ...["300", "400", "500", "600", "700", "800", "900"].map((w) => ({ value: w, label: w }))]} onChange={(fontWeight) => onChange({ fontWeight })} />
        <TextIn label={t("line_height")} value={style.lineHeight} placeholder="1.7" onChange={(lineHeight) => onChange({ lineHeight })} />
        <TextIn label={t("letter_spacing")} value={style.letterSpacing} placeholder="0px" onChange={(letterSpacing) => onChange({ letterSpacing })} />
        <SelectIn label={t("text_align")} value={style.textAlign} options={[{ value: "", label: "—" }, { value: "start", label: t("align_start") }, { value: "center", label: t("align_center") }, { value: "end", label: t("align_end") }]} onChange={(v) => onChange({ textAlign: (v || undefined) as StyleProps["textAlign"] })} />
        <SelectIn label={t("text_transform")} value={style.textTransform} options={[{ value: "", label: "—" }, { value: "uppercase", label: "ABC" }, { value: "lowercase", label: "abc" }, { value: "capitalize", label: "Abc" }]} onChange={(v) => onChange({ textTransform: (v || undefined) as StyleProps["textTransform"] })} />
      </Group>
      <Group title={t("style_background")}>
        <TokenColor label={t("background")} value={style.background} onChange={(background) => onChange({ background })} />
        <TextIn label={t("background_image")} value={style.backgroundImage} placeholder="https://…" onChange={(backgroundImage) => onChange({ backgroundImage })} />
        <TextIn label={t("opacity")} value={style.opacity} placeholder="1" onChange={(opacity) => onChange({ opacity })} />
      </Group>
      <Group title={t("style_spacing")}>
        <Edges label={t("padding")} value={style.padding} onChange={(padding) => onChange({ padding })} />
        <Edges label={t("margin")} value={style.margin} onChange={(margin) => onChange({ margin })} />
        <TextIn label={t("width")} value={style.width} placeholder="100%" onChange={(width) => onChange({ width })} />
        <TextIn label={t("max_width")} value={style.maxWidth} placeholder="1200px" onChange={(maxWidth) => onChange({ maxWidth })} />
        <TextIn label={t("min_height")} value={style.minHeight} placeholder="0" onChange={(minHeight) => onChange({ minHeight })} />
        <TextIn label={t("order")} value={style.order} placeholder="0" onChange={(order) => onChange({ order })} />
      </Group>
      <Group title={t("style_border")}>
        <TextIn label={t("border_width")} value={style.borderWidth} placeholder="1px" onChange={(borderWidth) => onChange({ borderWidth })} />
        <SelectIn label={t("border_style")} value={style.borderStyle} options={[{ value: "", label: "—" }, { value: "solid", label: "solid" }, { value: "dashed", label: "dashed" }, { value: "none", label: "none" }]} onChange={(v) => onChange({ borderStyle: (v || undefined) as StyleProps["borderStyle"] })} />
        <TokenColor label={t("border_color")} value={style.borderColor} onChange={(borderColor) => onChange({ borderColor })} />
        <TextIn label={t("radius")} value={style.radius} placeholder="16px" onChange={(radius) => onChange({ radius })} />
        <SelectIn label={t("shadow")} value={style.boxShadow} options={SHADOWS} onChange={(boxShadow) => onChange({ boxShadow })} />
      </Group>
      <label className="flex items-center justify-between">{t("hidden")}<input type="checkbox" checked={style.hidden === true} onChange={(event) => onChange({ hidden: event.target.checked })} /></label>
    </div>
  )
}

function AdvancedFields({ value, onChange }: { value: AdvancedProps; onChange: (patch: AdvancedProps) => void }) {
  const t = useTranslations("builder")
  const hide = value.hideOn ?? {}
  return (
    <div className="grid gap-2 text-xs">
      <TextIn label={t("css_class")} value={value.cssClass} placeholder="my-class" onChange={(cssClass) => onChange({ cssClass })} />
      <TextIn label={t("css_id")} value={value.cssId} placeholder="section-id" onChange={(cssId) => onChange({ cssId })} />
      <Group title={t("responsive_visibility")}>
        {(["desktop", "tablet", "mobile"] as const).map((d) => (
          <label key={d} className="flex items-center justify-between">
            {t(`hide_on_${d}`)}
            <input type="checkbox" checked={hide[d] === true} onChange={(event) => onChange({ hideOn: { ...hide, [d]: event.target.checked } })} />
          </label>
        ))}
      </Group>
      <SelectIn
        label={t("animation")}
        value={value.animation ?? "none"}
        options={[{ value: "none", label: "—" }, { value: "fade", label: t("anim_fade") }, { value: "slide-up", label: t("anim_slide_up") }, { value: "zoom", label: t("anim_zoom") }]}
        onChange={(v) => onChange({ animation: v as AdvancedProps["animation"] })}
      />
      <Group title={t("display_conditions")}>
        <ConditionsFields value={value.conditions ?? {}} onChange={(conditions) => onChange({ conditions })} />
      </Group>
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
