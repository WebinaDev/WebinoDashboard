"use client"

import { useRef } from "react"

import { DEFAULT_GLOBALS, globalsCss, type BuilderGlobals } from "../globals"
import { safeClass } from "../ids"
import { advancedAttrs, advancedClass, advancedId, hasCustomLayout, layoutToCss, mergeStyle, spanFor, styleToCss } from "../style"
import { migrateDocument } from "../migrate"
import { viewCss } from "../compile"
import { dirForLang } from "../lang"
import { Decor, motionAttrs, useCanvasMotion } from "./decor"
import { useConditionsVisible } from "./use-conditions"
import { useResolvedWidget } from "./use-dynamic"
import type { ColumnNode, DeviceMode, EditorApi, BuilderDocument, RuntimeContext, SectionNode, WidgetNode } from "../types"
import { DND_NODE, DND_WIDGET } from "../types"
import { BuilderGlobalsProvider, BuilderRuntimeProvider, useBuilderGlobals } from "./runtime"
import { applyPreset, COMPONENT_TYPE, componentsCss, resolveInstance } from "../components"
import { WidgetBody } from "./widgets"
import { LAYOUT_CONTAINER_TYPES, layoutContainerStyle } from "./gap-widgets"
import { dwClass, dwRowClass, sectionDesktopWidth, widgetDesktopWidth } from "./desktop-width"
import "./desktop-width.css"

import "../storefront.css"
import "@/themes/ecommerce-classic/classic-theme.css"
import "@/themes/storefront-skins.css"
import "@/themes/ecommerce-classic/parity.css"

type Props = {
  document: BuilderDocument
  mode?: "edit" | "view"
  device?: DeviceMode
  runtime?: RuntimeContext
  editor?: EditorApi
  themeClass?: string
  globals?: BuilderGlobals
}

function importedCss(document: BuilderDocument): string {
  const raw = typeof document.css === "string" ? document.css : ""
  return raw.replace(/<\/style/gi, "").replace(/<script/gi, "")
}

export function DocumentView({ document: rawDocument, mode = "view", device = "desktop", runtime, editor, themeClass, globals }: Props) {
  // v1 documents render through the legacy path (unchanged output).
  const document = migrateDocument(rawDocument)
  const activeGlobals = globals ?? DEFAULT_GLOBALS
  const nodeCss = mode === "view" ? viewCss(document, activeGlobals.breakpoints) : ""
  // Component (symbol) node CSS is shared by every instance; editor mode needs it too (instances render without inline styles).
  const symbolCss = componentsCss(document.sections, activeGlobals)
  const css = [globalsCss(activeGlobals), symbolCss, nodeCss, importedCss(document)].filter(Boolean).join("\n")
  const canvasRef = useRef<HTMLDivElement>(null)
  useCanvasMotion(canvasRef, mode === "view")
  return (
    <BuilderGlobalsProvider value={activeGlobals}>
      <BuilderRuntimeProvider value={runtime ?? {}}>
        <div ref={canvasRef} className={`wb-canvas ${themeClass ?? ""}`} dir={dirForLang(runtime?.lang)} lang={runtime?.lang ?? undefined}>
          {css ? <style>{css}</style> : null}
          <div className={`wb-section-stack ${document.sections.some((x) => sectionDesktopWidth(x) !== "full") ? dwRowClass(Boolean(editor), device) : ""}`}>
            {document.sections.map((section) => (
              <SectionBlock key={section.id} section={section} device={device} editor={editor} dwClassName={dwClass(sectionDesktopWidth(section))} />
            ))}
          </div>
        </div>
      </BuilderRuntimeProvider>
    </BuilderGlobalsProvider>
  )
}

function SectionBlock({ section, device, editor, depth = 0, dwClassName = "" }: { section: SectionNode; device: DeviceMode; editor?: EditorApi; depth?: number; dwClassName?: string }) {
  const selected = editor?.selectedId === section.id
  const sectionStyle = mergeStyle(section.style, device)
  const style = editor ? styleToCss(sectionStyle) : undefined
  const conditionsPass = useConditionsVisible(section.advanced?.conditions, Boolean(editor))
  if ((section.hidden || !conditionsPass) && !editor) return null
  return (
    <section
      id={section.id}
      className={`${dwClassName} ${safeClass(section.id)} ${section.fullWidth ? "" : "wb-container"} ${advancedClass(section.advanced)} ${selected ? "outline outline-2 outline-[#E16BA6]" : ""} ${editor && section.hidden ? "opacity-40" : ""}`}
      style={style}
      {...advancedAttrs(section.advanced)}
      {...motionAttrs(section.advanced)}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        if (!section.locked) editor.onSelect(section.id)
      }}
      onContextMenu={editor?.onContextMenu ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        editor.onContextMenu?.(section.id, event.clientX, event.clientY)
      } : undefined}
    >
      <Decor advanced={section.advanced} />
      <div
        className={`wb-columns grid items-start ${section.legacy ? "" : "wb-flow"}`}
        style={
          section.legacy
            ? { gridTemplateColumns: device === "mobile" ? "minmax(0,1fr)" : "repeat(12, minmax(0,1fr))" }
            : editor
              ? { gridTemplateColumns: "repeat(12, minmax(0,1fr))", ...layoutToCss(sectionStyle) }
              : undefined
        }
      >
        {section.columns.map((column) => (
          <ColumnBlock
            key={column.id}
            column={column}
            device={device}
            editor={editor}
            legacy={Boolean(section.legacy)}
            freeLayout={hasCustomLayout(sectionStyle)}
            depth={depth}
          />
        ))}
      </div>
    </section>
  )
}

function ColumnBlock({
  column,
  device,
  editor,
  legacy,
  freeLayout,
  depth = 0,
}: {
  column: ColumnNode
  device: DeviceMode
  editor?: EditorApi
  legacy: boolean
  freeLayout: boolean
  depth?: number
}) {
  const span = spanFor(column.span, column.tabletSpan, column.mobileSpan, device)
  const selected = editor?.selectedId === column.id
  const columnStyle = mergeStyle(column.style, device)
  const style = editor ? styleToCss(columnStyle) : undefined
  // Legacy: inline span (desktop span in view mode, single column in mobile preview).
  // v2 view mode: spans come from documentCss media rules; v2 editor: spans for the previewed device.
  const gridColumn = legacy
    ? `span ${device === "mobile" ? 1 : span}`
    : editor && !freeLayout
      ? `span ${span}`
      : undefined
  const conditionsPass = useConditionsVisible(column.advanced?.conditions, Boolean(editor))
  if ((column.hidden || !conditionsPass) && !editor) return null
  return (
    <div
      {...advancedAttrs(column.advanced)}
      {...motionAttrs(column.advanced)}
      className={`${safeClass(column.id)} ${advancedClass(column.advanced)} relative min-w-0 ${selected ? "outline outline-2 outline-dashed outline-[#0C2D63]" : ""} ${editor && column.hidden ? "opacity-40" : ""}`}
      style={{ ...style, gridColumn }}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        if (!column.locked) editor.onSelect(column.id)
      }}
      onContextMenu={editor?.onContextMenu ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        editor.onContextMenu?.(column.id, event.clientX, event.clientY)
      } : undefined}
    >
      <Decor advanced={column.advanced} />
      {editor ? <DropSlot columnId={column.id} index={0} editor={editor} /> : null}
      <div className={`wb-col-body flex flex-col ${column.widgets.some((w) => widgetDesktopWidth(w) !== "full") ? dwRowClass(Boolean(editor), device) : ""}`} style={!legacy && editor ? layoutToCss(columnStyle) : undefined}>
        {column.widgets.map((widget, index) => (
          <div key={widget.id} className={dwClass(widgetDesktopWidth(widget))}>
            <WidgetBlock widget={widget} device={device} editor={editor} depth={depth} />
            {editor ? <DropSlot columnId={column.id} index={index + 1} editor={editor} /> : null}
          </div>
        ))}
      </div>
      {editor && column.widgets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#0C2D63]/20 px-3 py-8 text-center text-xs text-[#0C2D63]/50">
          ویجت را اینجا رها کنید
        </div>
      ) : null}
      {editor ? <ResizeHandle column={column} editor={editor} /> : null}
    </div>
  )
}

function WidgetBlock({ widget: own, device, editor, depth = 0 }: { widget: WidgetNode; device: DeviceMode; editor?: EditorApi; depth?: number }) {
  const globals = useBuilderGlobals()
  const widget = applyPreset(own, globals)
  const selected = editor?.selectedId === widget.id
  const resolved = useResolvedWidget(widget)
  const conditionsPass = useConditionsVisible(widget.advanced?.conditions, Boolean(editor))
  const raw = editor ? styleToCss(mergeStyle(widget.style, device)) : undefined
  // In the editor, hidden widgets stay visible but faded so they can still be selected.
  const hiddenOnDevice = Boolean(editor && (raw?.display === "none" || widget.advanced?.hideOn?.[device] || widget.hidden))
  const style = raw && hiddenOnDevice ? { ...raw, display: undefined, opacity: 0.35 } : raw
  if ((widget.hidden || !conditionsPass) && !editor) return null
  return (
    <div
      id={advancedId(widget.advanced)}
      className={`${safeClass(widget.id)} ${advancedClass(widget.advanced)} ${selected ? "outline outline-2 outline-[#E16BA6]" : ""}`}
      style={style}
      {...advancedAttrs(widget.advanced)}
      {...motionAttrs(widget.advanced)}
      draggable={Boolean(editor) && !widget.locked}
      onDragStart={(event) => {
        event.dataTransfer.setData(DND_NODE, widget.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        if (!widget.locked) editor.onSelect(widget.id)
      }}
      onContextMenu={editor?.onContextMenu ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        editor.onContextMenu?.(widget.id, event.clientX, event.clientY)
      } : undefined}
    >
      {widget.type === COMPONENT_TYPE ? (
        <ComponentInstance widget={widget} device={device} depth={depth} editing={Boolean(editor)} />
      ) : (
        <WidgetBody widget={resolved} editor={editor} />
      )}
      {LAYOUT_CONTAINER_TYPES.has(widget.type) && widget.children ? (
        widget.type === "container" ? (
          widget.children.map((section) => <SectionBlock key={section.id} section={section} device={device} editor={editor} depth={depth} />)
        ) : (
          <div className={`wb-layout wb-layout-${widget.type}`} style={layoutContainerStyle(widget)}>
            {widget.children.map((section) => <SectionBlock key={section.id} section={section} device={device} editor={editor} depth={depth} />)}
          </div>
        )
      ) : null}
    </div>
  )
}

/** A component instance renders the master (variant + overrides); inside the editor it is selected as one unit. */
function ComponentInstance({ widget, device, depth, editing }: { widget: WidgetNode; device: DeviceMode; depth: number; editing: boolean }) {
  const globals = useBuilderGlobals()
  const sections = depth < 3 ? resolveInstance(globals, widget.props) : null
  if (!sections) {
    return editing ? <div className="rounded-xl border border-dashed p-4 text-center text-xs text-[#0C2D63]/60">کامپوننت پیدا نشد</div> : null
  }
  return (
    <div className={editing ? "pointer-events-none" : undefined} data-wb-component={String(widget.props.component)}>
      {sections.map((section) => <SectionBlock key={section.id} section={section} device={device} depth={depth + 1} />)}
    </div>
  )
}

function DropSlot({ columnId, index, editor }: { columnId: string; index: number; editor: EditorApi }) {
  return (
    <div
      className="my-1 h-2 rounded-full border border-dashed border-transparent hover:border-[#E16BA6]"
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const type = event.dataTransfer.getData(DND_WIDGET)
        const nodeId = event.dataTransfer.getData(DND_NODE)
        if (type) editor.onDropNew(columnId, index, type)
        else if (nodeId) editor.onDropMove(columnId, index, nodeId)
      }}
    />
  )
}

function ResizeHandle({ column, editor }: { column: ColumnNode; editor: EditorApi }) {
  return (
    <button
      type="button"
      aria-label="تغییر عرض"
      className="absolute inset-y-2 start-0 w-1.5 cursor-col-resize rounded-full bg-[#E16BA6]/0 hover:bg-[#E16BA6]"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startSpan = column.span
        const grid = event.currentTarget.parentElement?.parentElement
        const width = grid?.getBoundingClientRect().width ?? 1
        const unit = width / 12
        const move = (ev: PointerEvent) => {
          const delta = Math.round((startX - ev.clientX) / unit)
          editor.onResize(column.id, startSpan + delta)
        }
        const up = () => {
          window.removeEventListener("pointermove", move)
          window.removeEventListener("pointerup", up)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up)
      }}
    />
  )
}
