"use client"

import { SectionExtrasFields } from "./section-extras-fields"
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
  ArrowRight,
  ChevronDown,
  Columns3,
  Eye,
  MoreVertical,
  Plus,
  Rows3,
  Send,
  SlidersHorizontal,
  X,
  Palette as PaletteIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { asGlobals, COLOR_TOKENS, DEFAULT_GLOBALS, type BuilderGlobals } from "../globals"
import { createWidget, WIDGETS, widgetDef } from "../registry"
import { catalogEntry, catalogIcon, WIDGET_CATALOG_CATEGORIES } from "../widget-catalog"
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
import { KitPresetsPanel } from "./KitPresetsPanel"
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
  const [showKits, setShowKits] = useState(false)
  const [widgetQuery, setWidgetQuery] = useState("")
  const [showMore, setShowMore] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggleCategory = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  useEffect(() => {
    if (selectedId && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) setDrawerOpen(true)
  }, [selectedId])
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
  const inspecting = selection !== null
  const selectionLabel = !selection ? "" : selection.kind === "widget" ? widgetDef(selection.widget.type)?.label ?? selection.widget.type : selection.kind === "section" ? t("section") : t("column")
  const groupedWidgets = WIDGET_CATALOG_CATEGORIES.map((category) => ({
    category,
    items: WIDGETS.filter((widget) => catalogEntry(widget.type).category === category.id && (!needle || widget.label.includes(needle) || widget.type.includes(needle.toLowerCase()))),
  })).filter((group) => group.items.length > 0)

  if (loading) {
    return <div className="grid h-svh max-h-full min-h-0 place-items-center text-sm text-foreground">{t("loading")}</div>
  }

  return (
    <DesignProvider value={designApi}>
    <div className="flex h-svh max-h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2 text-foreground sm:gap-2 sm:px-3">
        <Link href={backHref} aria-label={t("back")} title={t("back")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowRight className="size-4" aria-hidden /></Link>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="hidden h-9 w-40 min-w-0 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary md:block" aria-label={t("title")} />
        <span className="hidden text-[11px] text-muted-foreground lg:inline" aria-live="polite">{saving ? t("saving") : dirty ? t("unsaved") : t("all_saved")}</span>
        <div className="mx-auto flex items-center gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label={t("device_preview")}>
          <IconButton label={t("desktop")} active={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor className="size-4" /></IconButton>
          <IconButton label={t("tablet")} active={device === "tablet"} onClick={() => setDevice("tablet")}><Tablet className="size-4" /></IconButton>
          <IconButton label={t("mobile")} active={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone className="size-4" /></IconButton>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label={t("undo")} onClick={undo}><Undo2 className="size-4" /></IconButton>
          <IconButton label={t("redo")} onClick={redo}><Redo2 className="size-4" /></IconButton>
        </div>
        <a href={preview} target="_blank" rel="noreferrer" aria-label={t("preview")} title={t("preview")} className="hidden size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted sm:grid"><Eye className="size-4" aria-hidden /></a>
        <div className="relative">
          <IconButton label={t("more")} active={showMore} onClick={() => setShowMore((v) => !v)}><MoreVertical className="size-4" /></IconButton>
          {showMore ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} aria-hidden />
              <div role="menu" className="absolute end-0 top-11 z-50 grid w-64 gap-0.5 rounded-xl border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-xl" onClick={() => setShowMore(false)}>
                <div className="grid gap-1.5 p-1.5 md:hidden" onClick={(event) => event.stopPropagation()}>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none" aria-label={t("title")} placeholder={t("title")} />
                </div>
                {mode.kind === "page" ? (
                  <div className="grid gap-1 p-1.5" onClick={(event) => event.stopPropagation()}>
                    <span className="text-[11px] text-muted-foreground">{t("slug")}</span>
                    <input value={slug} onChange={(event) => setSlug(event.target.value)} dir="ltr" className="h-9 rounded-lg border border-border bg-background px-2 text-xs outline-none" aria-label={t("slug")} />
                  </div>
                ) : null}
                <a href={preview} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted sm:hidden"><Eye className="size-4" aria-hidden />{t("preview")}</a>
                <MoreItem icon={Search} label={t("finder")} onClick={() => setShowFinder(true)} />
                {mode.kind === "page" && pageId ? <MoreItem icon={FileCog} label={t("page_settings")} onClick={() => setShowPageSettings(true)} /> : null}
                {revisionTarget ? <MoreItem icon={History} label={t("revisions")} onClick={() => setShowRevisions(true)} /> : null}
                <MoreItem icon={PaletteIcon} label="کیت‌های آماده" onClick={() => setShowKits(true)} />
                <Link href="/dashboard/builder/settings" className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted"><Settings2 className="size-4" aria-hidden />{t("globals")}</Link>
                <MoreItem icon={LayoutTemplate} label={t("save_page_template")} onClick={() => void saveToLibrary(null)} />
                <MoreItem icon={Accessibility} label={t("a11y_audit")} onClick={() => setShowA11y(true)} />
                <div className="my-1 h-px bg-border" />
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
                  <ZoomIn className="size-4" aria-hidden />
                  <span className="flex-1">{t("zoom")}</span>
                  <select aria-label={t("zoom")} className="rounded-md border border-border bg-background px-1 py-0.5 text-xs" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
                    {[50, 75, 90, 100, 125].map((value) => <option key={value} value={value}>{value}٪</option>)}
                  </select>
                </label>
                <MoreItem icon={Download} label={t("export_json")} onClick={exportJson} />
                <MoreItem icon={Upload} label={t("import_json")} onClick={() => importRef.current?.click()} />
                <MoreItem icon={Keyboard} label={t("shortcuts")} onClick={() => setShowHelp(true)} />
              </div>
            </>
          ) : null}
        </div>
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
        <Button type="button" size="sm" variant="outline" className="hidden sm:inline-flex" disabled={saving} onClick={() => void save(false)}>{t("save")}</Button>
        <Button type="button" size="sm" disabled={saving} onClick={() => void save(true)} aria-label={t("publish")}>
          <Send className="size-4 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">{t("publish")}</span>
        </Button>
      </header>
      {showKits ? <KitPresetsPanel globals={globals} onApply={updateGlobals} onClose={() => setShowKits(false)} /> : null}
      {showRevisions && revisionTarget ? (
        <RevisionsPanel
          target={revisionTarget}
          globals={globals}
          current={doc}
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
      <div className="relative flex min-h-0 flex-1">
        {drawerOpen ? <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden /> : null}
        <aside
          aria-label={inspecting ? t("settings") : t("widgets")}
          className={`z-40 flex flex-col border-border bg-background text-foreground shadow-2xl transition-transform duration-300 lg:static lg:w-80 lg:shrink-0 lg:translate-x-0 lg:translate-y-0 lg:border-e lg:shadow-none max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:h-[72svh] max-md:rounded-t-2xl max-md:border-t md:max-lg:fixed md:max-lg:inset-y-0 md:max-lg:start-0 md:max-lg:top-14 md:max-lg:w-96 md:max-lg:border-e ${drawerOpen ? "" : "max-md:translate-y-full md:max-lg:hidden"}`}
        >
          <div className="flex justify-center pt-2 md:hidden" aria-hidden><span className="h-1 w-10 rounded-full bg-border" /></div>
          {inspecting && selection ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-border px-2 py-2">
                <button type="button" onClick={() => setSelectedId(null)} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10">
                  <ArrowRight className="size-4 rtl:rotate-0 ltr:rotate-180" aria-hidden />
                  {t("widgets")}
                </button>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-sm font-bold">
                  <span className="truncate">{selectionLabel}</span>
                  {selection.kind === "widget" ? <WidgetGlyph type={selection.widget.type} className="size-4 shrink-0 text-primary" /> : selection.kind === "section" ? <Rows3 className="size-4 shrink-0 text-primary" aria-hidden /> : <Columns3 className="size-4 shrink-0 text-primary" aria-hidden />}
                </div>
                <button type="button" aria-label={t("close")} onClick={() => setDrawerOpen(false)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"><X className="size-4" aria-hidden /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
          <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1 text-xs font-semibold">
            <button type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === "content" ? "bg-background text-primary shadow-sm" : ""}`} onClick={() => setTab("content")}>
              <Type className="size-3.5" aria-hidden />
              {t("content")}
            </button>
            <button type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === "style" ? "bg-background text-primary shadow-sm" : ""}`} onClick={() => setTab("style")}>
              <Paintbrush className="size-3.5" aria-hidden />
              {t("style")}
            </button>
            <button type="button" className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === "advanced" ? "bg-background text-primary shadow-sm" : ""}`} onClick={() => setTab("advanced")}>
              <Settings2 className="size-3.5" aria-hidden />
              {t("advanced")}
            </button>
          </div>
          {!selection ? (
            <div className="grid place-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <MousePointerClick className="size-5" aria-hidden />
              {t("no_selection")}
            </div>
          ) : null}
          {selection && isLocked(doc, selection.id) ? (
            <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-border bg-muted p-2 text-[11px]">
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
                <SectionExtrasFields
                  section={selection.section}
                  onChange={(patch) => commit(updateSection(doc, selection.id, (node) => ({ ...node, ...patch })))}
                />
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
              </div>
            </div>
          ) : (
            <>
          <div className="flex items-center border-b border-border text-xs font-semibold">
            <button type="button" className={`flex flex-1 items-center justify-center gap-1.5 py-3 ${panel === "widgets" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`} onClick={() => setPanel("widgets")}>
              <Blocks className="size-4" aria-hidden />
              {t("widgets")}
            </button>
            <button type="button" className={`flex flex-1 items-center justify-center gap-1.5 py-3 ${panel === "navigator" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`} onClick={() => setPanel("navigator")}>
              <ListTree className="size-4" aria-hidden />
              {t("navigator")}
            </button>
            <button type="button" className={`flex flex-1 items-center justify-center gap-1.5 py-3 ${panel === "library" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`} onClick={() => setPanel("library")}>
              <LayoutTemplate className="size-4" aria-hidden />
              {t("library")}
            </button>
            <button type="button" aria-label={t("close")} onClick={() => setDrawerOpen(false)} className="grid size-9 place-items-center text-muted-foreground lg:hidden"><X className="size-4" aria-hidden /></button>
          </div>
          {panel === "widgets" ? (
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
              <label className="sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-xl border border-border bg-background px-2 shadow-sm">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <input value={widgetQuery} onChange={(event) => setWidgetQuery(event.target.value)} placeholder={t("widget_search")} aria-label={t("widget_search")} className="h-10 w-full bg-transparent text-sm outline-none" />
              </label>
              <Button type="button" variant="outline" className="mb-3 w-full" onClick={() => { commit(addSection(doc)) }}>{t("add_section")}</Button>
              {globals.components.length ? (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><Blocks className="size-3" aria-hidden />{t("components")}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {globals.components.filter((c) => !needle || c.name.includes(needle)).map((c) => (
                      <button key={c.id} type="button" className="rounded-xl border border-border bg-card px-2 py-3 text-xs hover:border-primary" onClick={() => insertComponent(c.id)}>{c.name}</button>
                    ))}
                  </div>
                </div>
              ) : null}
              {groupedWidgets.map(({ category, items }) => {
                const open = needle.length > 0 || !collapsed.has(category.id)
                const CatIcon = catalogIcon(category.icon)
                return (
                  <section key={category.id} className="mb-2 rounded-xl border border-border bg-card">
                    <button type="button" aria-expanded={open} onClick={() => toggleCategory(category.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-bold text-foreground">
                      <CatIcon className="size-4 text-primary" aria-hidden />
                      <span className="flex-1 text-start">{category.label}</span>
                      <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{items.length.toLocaleString("fa-IR")}</span>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "" : "rotate-90"}`} aria-hidden />
                    </button>
                    {open ? (
                      <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">
                        {items.map((widget) => (
                          <button
                            key={widget.type}
                            type="button"
                            draggable
                            title={widget.label}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(DND_WIDGET, widget.type)
                              event.dataTransfer.effectAllowed = "copy"
                            }}
                            onClick={() => insertFromPalette(widget.type)}
                            className="flex min-h-[76px] touch-manipulation flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent bg-muted/50 px-1 py-2 text-center text-[11px] font-medium leading-4 text-foreground transition hover:border-primary hover:bg-primary/5 active:scale-95"
                          >
                            <WidgetGlyph type={widget.type} className="size-5 text-primary" />
                            <span className="line-clamp-2">{shortLabel(widget.label)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>
                )
              })}
              {groupedWidgets.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">{t("no_results")}</p> : null}
            </div>
          ) : (
            panel === "navigator" ? (
              <Navigator doc={doc} selectedId={selectedId} onSelect={setSelectedId} commit={commit} onContextMenu={(id, x, y) => { setSelectedId(id); setMenu({ id, x, y }) }} />
            ) : (
              <LibraryPanel refreshKey={libraryKey} onInsert={insertLibrary} />
            )
          )}
            </>
          )}
        </aside>
        <main className="wb-editor-stage min-w-0 flex-1 overflow-auto bg-muted/60 p-2 pb-20 sm:p-4 lg:p-6 lg:pb-6" onClick={() => setSelectedId(null)}>
          <div className="wb-theme-boundary mx-auto min-h-full max-w-full overflow-hidden rounded-2xl bg-background text-foreground shadow-xl ring-1 ring-border transition-[width] duration-300" style={{ width: DEVICE_WIDTH[device], zoom: zoom / 100 }}>
            {doc.sections.length === 0 ? (
              <div className="grid min-h-80 place-items-center gap-2 text-sm">
                <Blocks className="size-5 text-foreground/30" aria-hidden />
                {t("empty")}
              </div>
            ) : (
              <Suspense fallback={null}>
                <DocumentView document={doc} mode="edit" device={device} editor={editor} globals={globals} runtime={{ siteName: title || "ویبینو" }} />
              </Suspense>
            )}
          </div>
        </main>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={`fixed bottom-4 start-1/2 z-20 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg rtl:translate-x-1/2 lg:hidden ${drawerOpen ? "hidden" : ""}`}
        >
          {selection ? <SlidersHorizontal className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {selection ? t("edit_selected") : t("add_widget")}
        </button>
      </div>
    </div>
    </DesignProvider>
  )
}

function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "")
}

function MoreItem({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex items-center gap-2 rounded-lg px-2 py-2 text-start hover:bg-muted">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {label}
    </button>
  )
}

function IconButton({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={`grid size-9 place-items-center rounded-lg ${active ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
      {children}
    </button>
  )
}

function FieldMark({ name }: { name: string }) {
  const Icon = FIELD_ICONS[name] ?? Settings2
  return <Icon className="size-3.5 shrink-0 text-foreground/45" aria-hidden />
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
