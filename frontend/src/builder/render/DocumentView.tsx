"use client"

import { DEFAULT_GLOBALS, globalsCss, type BuilderGlobals } from "../globals"
import { safeClass } from "../ids"
import { advancedClass, advancedId, documentCss, hasCustomLayout, layoutToCss, mergeStyle, spanFor, styleToCss } from "../style"
import { migrateDocument } from "../migrate"
import type { ColumnNode, DeviceMode, EditorApi, BuilderDocument, RuntimeContext, SectionNode, WidgetNode } from "../types"
import { DND_NODE, DND_WIDGET } from "../types"
import { BuilderGlobalsProvider, BuilderRuntimeProvider } from "./runtime"
import { WidgetBody } from "./widgets"

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
  const nodeCss = mode === "view" ? documentCss(document) : ""
  const css = [globalsCss(activeGlobals), nodeCss, importedCss(document)].filter(Boolean).join("\n")
  return (
    <BuilderGlobalsProvider value={activeGlobals}>
      <BuilderRuntimeProvider value={runtime ?? {}}>
        <div className={`wb-canvas ${themeClass ?? ""}`} dir="rtl">
          {css ? <style>{css}</style> : null}
          <div className="wb-section-stack">
            {document.sections.map((section) => (
              <SectionBlock key={section.id} section={section} device={device} editor={editor} />
            ))}
          </div>
        </div>
      </BuilderRuntimeProvider>
    </BuilderGlobalsProvider>
  )
}

function SectionBlock({ section, device, editor }: { section: SectionNode; device: DeviceMode; editor?: EditorApi }) {
  const selected = editor?.selectedId === section.id
  const sectionStyle = mergeStyle(section.style, device)
  const style = editor ? styleToCss(sectionStyle) : undefined
  return (
    <section
      id={section.id}
      className={`${safeClass(section.id)} ${section.fullWidth ? "" : "wb-container"} ${selected ? "outline outline-2 outline-[#E16BA6]" : ""}`}
      style={style}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        editor.onSelect(section.id)
      }}
    >
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
}: {
  column: ColumnNode
  device: DeviceMode
  editor?: EditorApi
  legacy: boolean
  freeLayout: boolean
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
  return (
    <div
      className={`${safeClass(column.id)} relative min-w-0 ${selected ? "outline outline-2 outline-dashed outline-[#0C2D63]" : ""}`}
      style={{ ...style, gridColumn }}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        editor.onSelect(column.id)
      }}
    >
      {editor ? <DropSlot columnId={column.id} index={0} editor={editor} /> : null}
      <div className="wb-col-body flex flex-col" style={!legacy && editor ? layoutToCss(columnStyle) : undefined}>
        {column.widgets.map((widget, index) => (
          <div key={widget.id}>
            <WidgetBlock widget={widget} device={device} editor={editor} />
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

function WidgetBlock({ widget, device, editor }: { widget: WidgetNode; device: DeviceMode; editor?: EditorApi }) {
  const selected = editor?.selectedId === widget.id
  const raw = editor ? styleToCss(mergeStyle(widget.style, device)) : undefined
  // In the editor, hidden widgets stay visible but faded so they can still be selected.
  const hiddenOnDevice = Boolean(editor && (raw?.display === "none" || widget.advanced?.hideOn?.[device]))
  const style = raw && hiddenOnDevice ? { ...raw, display: undefined, opacity: 0.35 } : raw
  return (
    <div
      id={advancedId(widget.advanced)}
      className={`${safeClass(widget.id)} ${advancedClass(widget.advanced)} ${selected ? "outline outline-2 outline-[#E16BA6]" : ""}`}
      style={style}
      draggable={Boolean(editor)}
      onDragStart={(event) => {
        event.dataTransfer.setData(DND_NODE, widget.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        editor.onSelect(widget.id)
      }}
    >
      <WidgetBody widget={widget} editor={editor} />
      {widget.type === "container" && widget.children
        ? widget.children.map((section) => <SectionBlock key={section.id} section={section} device={device} editor={editor} />)
        : null}
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
