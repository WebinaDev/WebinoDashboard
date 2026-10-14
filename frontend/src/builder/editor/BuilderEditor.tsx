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
  Accessibility,
  FileCog,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { asGlobals, COLOR_TOKENS, DEFAULT_GLOBALS, type BuilderGlobals } from "../globals"
import { createWidget, WIDGET_CATEGORIES, WIDGETS, widgetDef } from "../registry"
import { compileDocument } from "../compile"
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
import type { FieldDef, AdvancedProps, ShapeName, BoxEdges, BuilderDocument, DeviceMode, EditorApi, StyleProps } from "../types"
import { DND_WIDGET } from "../types"
import { DocumentView } from "../render/DocumentView"
import { migrateDocument } from "../migrate"
import { DynamicEditor, DynamicToggle, EXTENDED_KINDS, ExtendedField } from "./fields"
import { isDynamic } from "../dynamic"
import { ContextMenu, type MenuItem } from "./ContextMenu"
import { AdvancedFields, StyleFields } from "./style-panel"
import { DesignProvider } from "./design-context"
import { ComponentInstanceFields, DesignSystemFields } from "./design-panel"
import { COMPONENT_TYPE, detachInstance, instanceWidget, makeComponent, remapIds, updateComponentSections } from "../components"
import { uid } from "../ids"
import { createSection, findWidget } from "../tree"
import { FormActionsPanel } from "./FormActionsPanel"
import { LibraryPanel } from "./LibraryPanel"
import { propStr } from "../props"
import { Navigator } from "./Navigator"
import { ShortcutHelp } from "./ShortcutHelp"
import { CLIPBOARD_KEY, duplicateSection, exportPayload, findNode, importPayload, isLocked, makeClip, parseClip, pasteClip, pasteStyle, patchNode, type Clip } from "../ops"
import { RevisionsPanel, type RevisionTarget } from "./RevisionsPanel"
import { A11yPanel } from "./A11yPanel"
import { Finder, type FinderAction } from "./Finder"
import { PageSettingsPanel } from "./PageSettingsPanel"
import { ApiError } from "@/lib/api"
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
  const [showPageSettings, setShowPageSettings] = useState(false)
  const [showA11y, setShowA11y] = useState(false)
  const [showFinder, setShowFinder] = useState(false)
  const [lockedBy, setLockedBy] = useState<string | null>(null)
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

  // Design-system edits (classes, presets, components) go to the globals draft; published with the page.
  const globalsTouched = useRef(false)
  const globalsTimer = useRef<number | null>(null)
  const updateGlobals = useCallback((next: BuilderGlobals) => {
    setGlobals(next)
    globalsTouched.current = true
    if (globalsTimer.current) window.clearTimeout(globalsTimer.current)
    globalsTimer.current = window.setTimeout(() => {
      api("/api/v1/builder/globals", { method: "PUT", json: { settings: next } }).catch((error) => {
        toast.error(error instanceof ApiError && error.status === 403 ? t("no_permission") : t("save_failed"))
      })
    }, 700)
  }, [t])
  const designApi = useMemo(() => ({ globals, updateGlobals }), [globals, updateGlobals])

  async function publishGlobalsIfTouched() {
    if (!globalsTouched.current) return
    try {
      await api("/api/v1/builder/globals", { method: "PUT", json: { settings: globals } })
      await api("/api/v1/builder/globals/publish", { method: "POST" })
      globalsTouched.current = false
    } catch {
      toast.error(t("globals_publish_failed"))
    }
  }

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

  // Edit lock for builder pages: heartbeat while open, release on leave; 423 means someone else is editing.
  const lockPageId = mode.kind === "page" ? pageId : null
  const acquireLock = useCallback(async (takeover = false) => {
    if (!lockPageId) return
    try {
      await api(`/api/v1/builder/pages/${lockPageId}/lock`, { method: "POST", json: takeover ? { takeover: true } : {} })
      setLockedBy(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 423) {
        const body = error.body as { data?: { locked_by?: { name?: string } } } | undefined
        setLockedBy(body?.data?.locked_by?.name || "?")
      }
    }
  }, [lockPageId])
  useEffect(() => {
    if (!lockPageId) return
    void acquireLock()
    const timer = window.setInterval(() => void acquireLock(), 45_000)
    return () => {
      window.clearInterval(timer)
      void api(`/api/v1/builder/pages/${lockPageId}/lock`, { method: "DELETE" }).catch(() => undefined)
    }
  }, [acquireLock, lockPageId])

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
      } else if (meta && key === "e") {
        event.preventDefault()
        setShowFinder(true)
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

  const finderActions: FinderAction[] = [
    ...globals.components.map((c) => ({ id: `component-${c.id}`, label: `${t("component")}: ${c.name}`, run: () => insertComponent(c.id) })),
    { id: "save", label: t("save"), run: () => void save(false) },
    { id: "publish", label: t("publish"), run: () => void save(true) },
    { id: "undo", label: t("undo"), run: undo },
    { id: "redo", label: t("redo"), run: redo },
    { id: "desktop", label: t("desktop"), run: () => setDevice("desktop") },
    { id: "tablet", label: t("tablet"), run: () => setDevice("tablet") },
    { id: "mobile", label: t("mobile"), run: () => setDevice("mobile") },
    { id: "a11y", label: t("a11y_audit"), run: () => setShowA11y(true) },
    { id: "shortcuts", label: t("shortcuts"), run: () => setShowHelp(true) },
    { id: "export", label: t("export_json"), run: exportJson },
    ...(mode.kind === "page" && pageId ? [{ id: "page-settings", label: t("page_settings"), run: () => setShowPageSettings(true) }] : []),
  ]

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
    const outDoc = compileDocument(doc, globals.breakpoints)
    setSaving(true)
    try {
      if (mode.kind === "chrome") {
        await api(`/api/v1/builder/templates/${mode.chrome}`, {
          method: "PUT",
          json: { title, document: outDoc, ...(autosave ? { autosave: true } : {}) },
        })
        if (publish) {
          await api(`/api/v1/builder/templates/${mode.chrome}/publish`, { method: "POST" })
          await publishGlobalsIfTouched()
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
            json: { kind: mode.templateKind, title: title || t("create"), document: outDoc },
          })
          id = created.id ?? null
          setPageId(id)
          if (id) window.history.replaceState(null, "", `/dashboard/theme-builder/${mode.templateKind}/${id}`)
        } else {
          await api(`/api/v1/theme-builder/templates/${id}`, {
            method: "PATCH",
            json: { title, document: outDoc, ...(autosave ? { autosave: true } : {}) },
          })
        }
        if (publish && id) {
          await api(`/api/v1/theme-builder/templates/${id}/publish`, { method: "POST" })
          await publishGlobalsIfTouched()
          toast.success(t("published"))
        } else if (!autosave) toast.success(t("saved"))
        setSavedJson(snapshot)
        return
      }
      if (mode.kind === "product" || mode.kind === "post" || mode.kind === "article") {
        const base = mode.kind === "product" ? "products" : mode.kind === "post" ? "posts" : "articles"
        await api(`/api/v1/builder/${base}/${mode.id}`, {
          method: "PATCH",
          json: { title, document: outDoc, ...(autosave ? { autosave: true } : {}) },
        })
        if (publish) {
          await api(`/api/v1/builder/${base}/${mode.id}/publish`, { method: "POST" })
          await publishGlobalsIfTouched()
          toast.success(t("published"))
        } else if (!autosave) toast.success(t("saved"))
        setSavedJson(snapshot)
        return
      }
      let id = pageId
      if (!id) {
        const created = await api<PagePayload>("/api/v1/builder/pages", {
          method: "POST",
          json: { title: title || t("create"), slug, document: outDoc },
        })
        id = created.id
        setPageId(id)
        setSlug(created.slug)
        window.history.replaceState(null, "", `/dashboard/builder/${id}`)
      } else {
        await api(`/api/v1/builder/pages/${id}`, {
          method: "PATCH",
          json: { title, slug, document: outDoc, ...(autosave ? { autosave: true } : {}) },
        })
      }
      if (publish) {
        await api(`/api/v1/builder/pages/${id}/publish`, { method: "POST" })
        await publishGlobalsIfTouched()
          toast.success(t("published"))
      } else if (!autosave) toast.success(t("saved"))
      setSavedJson(snapshot)
    } catch (error) {
      if (error instanceof ApiError && error.status === 423) {
        setLockedBy(error.message.replace(/^locked by /, "") || "?")
        toast.error(t("locked_by_other"))
      } else if (error instanceof ApiError && error.status === 403) {
        toast.error(t("no_permission"))
      } else if (!autosave) toast.error(t("save_failed"))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    saveRef.current = save
  })

  function insertComponent(componentId: string) {
    let columnId = defaultColumnId(doc, selectedId)
    let next = doc
    if (!columnId) {
      next = addSection(doc)
      columnId = next.sections[0]?.columns[0]?.id ?? null
    }
    if (!columnId) return
    const widget = instanceWidget(uid("w"), componentId)
    commit(insertWidget(next, columnId, 999, widget))
    setSelectedId(widget.id)
  }

  function convertToComponent(id: string) {
    const name = window.prompt(t("component_name_prompt"))?.trim()
    if (!name) return
    const taken = globals.components.map((c) => c.id)
    const section = doc.sections.find((item) => item.id === id) ?? null
    const widgetHit = section ? null : findWidget(doc, id)
    if (!section && !widgetHit) return
    const sections = section ? [section] : [{ ...createSection([12]), columns: [{ ...createSection([12]).columns[0], widgets: [widgetHit!.widget] }] }]
    const component = makeComponent(name, sections, taken)
    updateGlobals({ ...globals, components: [...globals.components, component] })
    const instance = instanceWidget(uid("w"), component.id)
    if (section) {
      const wrapper = createSection([12])
      commit(updateSection(doc, id, () => ({ ...wrapper, columns: [{ ...wrapper.columns[0], widgets: [instance] }] })))
    } else {
      commit(updateWidget(doc, id, () => instance))
    }
    setSelectedId(instance.id)
    toast.success(t("component_created"))
  }

  function pushToComponent(id: string, asVariant: boolean) {
    const hit = findWidget(doc, id)
    const widget = hit?.widget
    const source = typeof widget?.props.componentSource === "string" ? widget.props.componentSource : ""
    if (!widget?.children || !source) return
    const variantName = asVariant ? window.prompt(t("variant_name_prompt"))?.trim() : undefined
    if (asVariant && !variantName) return
    const map = (widget.props.componentMap ?? {}) as Record<string, string>
    const sections = remapIds(widget.children, map)
    const existingVariant = typeof widget.props.componentVariant === "string" ? globals.components.find((c) => c.id === source)?.variants?.find((v) => v.id === widget.props.componentVariant)?.name : undefined
    updateGlobals({ ...globals, components: updateComponentSections(globals.components, source, sections, variantName ?? existingVariant) })
    commit(updateWidget(doc, id, () => ({ ...instanceWidget(id, source), props: { component: source, variant: asVariant ? "" : String(widget.props.componentVariant ?? ""), overrides: {} } })))
    toast.success(t("component_updated"))
  }

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
      ...componentMenu(id),
      "sep",
      { id: "delete", label: t("delete"), shortcut: "Del", danger: true, disabled: locked, onSelect: () => deleteNode(id) },
    ]
  }

  function componentMenu(id: string): MenuItem[] {
    const hit = findWidget(doc, id)
    const widget = hit?.widget
    const items: MenuItem[] = []
    if (widget?.type === COMPONENT_TYPE) {
      items.push({ id: "detach", label: t("component_detach"), onSelect: () => {
        const detached = detachInstance(widget, globals)
        if (detached) commit(updateWidget(doc, id, () => detached))
      } })
    } else if (widget?.type === "container" && typeof widget.props.componentSource === "string") {
      items.push({ id: "push", label: t("component_push"), onSelect: () => pushToComponent(id, false) })
      items.push({ id: "push-variant", label: t("component_push_variant"), onSelect: () => pushToComponent(id, true) })
    }
    const kind = findNode(doc, id)?.kind
    if ((kind === "section" && doc.sections.some((section) => section.id === id)) || (kind === "widget" && widget?.type !== COMPONENT_TYPE)) {
      items.push({ id: "to-component", label: t("component_convert"), onSelect: () => convertToComponent(id) })
    }
    return items
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
    <DesignProvider value={designApi}>
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
        <IconButton label={t("finder")} onClick={() => setShowFinder(true)}><Search className="size-4" /></IconButton>
        <IconButton label={t("a11y_audit")} onClick={() => setShowA11y(true)}><Accessibility className="size-4" /></IconButton>
        {mode.kind === "page" && pageId ? (
          <IconButton label={t("page_settings")} onClick={() => setShowPageSettings(true)}><FileCog className="size-4" /></IconButton>
        ) : null}
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
      {lockedBy ? (
        <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-xs text-amber-900" role="alert">
          {t("locked_banner", { name: lockedBy })}
          <Button type="button" size="sm" variant="outline" onClick={() => { if (window.confirm(t("takeover_confirm"))) void acquireLock(true) }}>{t("takeover")}</Button>
        </div>
      ) : null}
      {showFinder ? (
        <Finder
          doc={doc}
          actions={finderActions}
          onAdd={insertFromPalette}
          onSelect={(id) => setSelectedId(id)}
          onClose={() => setShowFinder(false)}
        />
      ) : null}
      {showA11y ? <A11yPanel doc={doc} onSelect={(id) => { setSelectedId(id); setShowA11y(false) }} onClose={() => setShowA11y(false)} /> : null}
      {showPageSettings && mode.kind === "page" && pageId ? (
        <PageSettingsPanel
          pageId={pageId}
          title={title}
          onClose={() => setShowPageSettings(false)}
          onDiscarded={(restored) => {
            commit(restored)
            setSavedJson(JSON.stringify(restored))
          }}
        />
      ) : null}
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
              {globals.components.length ? (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#0C2D63]/60"><Blocks className="size-3" aria-hidden />{t("components")}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {globals.components.filter((c) => !needle || c.name.includes(needle)).map((c) => (
                      <button key={c.id} type="button" className="rounded-xl border border-[#e6eef6] bg-white px-2 py-3 text-xs hover:border-[#E16BA6]" onClick={() => insertComponent(c.id)}>{c.name}</button>
                    ))}
                  </div>
                </div>
              ) : null}
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
                <DesignSystemFields
                  node={selection.section}
                  device={device}
                  onAdvanced={(patch) => commit(updateSection(doc, selection.id, (node) => ({ ...node, advanced: { ...(node.advanced ?? {}), ...patch } })))}
                  onStyle={(style) => commit(updateSection(doc, selection.id, (node) => ({ ...node, style })))}
                />
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
              {tab === "advanced" ? (
                <AdvancedFields
                  layout
                  value={selection.section.advanced ?? {}}
                  onChange={(patch) => commit(updateSection(doc, selection.id, (node) => ({ ...node, advanced: { ...(node.advanced ?? {}), ...patch } })))}
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
                <DesignSystemFields
                  node={selection.column}
                  device={device}
                  onAdvanced={(patch) => commit(updateColumn(doc, selection.id, (node) => ({ ...node, advanced: { ...(node.advanced ?? {}), ...patch } })))}
                  onStyle={(style) => commit(updateColumn(doc, selection.id, (node) => ({ ...node, style })))}
                />
              ) : null}
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
              {tab === "advanced" ? (
                <AdvancedFields
                  layout
                  value={selection.column.advanced ?? {}}
                  onChange={(patch) => commit(updateColumn(doc, selection.id, (node) => ({ ...node, advanced: { ...(node.advanced ?? {}), ...patch } })))}
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
              {tab === "content" && selection.widget.type === COMPONENT_TYPE ? (
                <ComponentInstanceFields
                  widget={selection.widget}
                  onProps={(patch) => commit(updateWidget(doc, selection.id, (widget) => ({ ...widget, props: { ...widget.props, ...patch } })))}
                />
              ) : tab === "content" ? (
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
                <>
                <DesignSystemFields
                  node={selection.widget}
                  widget={selection.widget}
                  device={device}
                  onAdvanced={(patch) => commit(updateWidget(doc, selection.id, (widget) => ({ ...widget, advanced: { ...(widget.advanced ?? {}), ...patch } })))}
                  onStyle={(style) => commit(updateWidget(doc, selection.id, (widget) => ({ ...widget, style })))}
                />
                <StyleFields
                  device={device}
                  style={mergeStyle(selection.widget.style, device)}
                  onChange={(patch) => commit(updateWidget(doc, selection.id, (widget) => ({
                    ...widget,
                    style: { ...widget.style, [device === "desktop" ? "base" : device]: { ...mergeStyle(widget.style, device), ...patch } },
                  })))}
                />
                </>
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
    </DesignProvider>
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
