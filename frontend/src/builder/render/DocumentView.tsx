"use client"

import { safeClass } from "../ids"
import { documentCss, mergeStyle, spanFor, styleToCss } from "../style"
import type { ColumnNode, DeviceMode, EditorApi, BuilderDocument, RuntimeContext, SectionNode, WidgetNode } from "../types"
import { DND_NODE, DND_WIDGET } from "../types"
import { BuilderRuntimeProvider } from "./runtime"
import { WidgetBody } from "./widgets"

import "../ishop.css"

type Props = {
  document: BuilderDocument
  mode?: "edit" | "view"
  device?: DeviceMode
  runtime?: RuntimeContext
  editor?: EditorApi
  themeClass?: string
}

function importedCss(document: BuilderDocument): string {
  const raw = typeof document.css === "string" ? document.css : ""
  return raw.replace(/<\/style/gi, "").replace(/<script/gi, "")
}

export function DocumentView({ document, mode = "view", device = "desktop", runtime, editor, themeClass }: Props) {
  const nodeCss = mode === "view" ? documentCss(document) : ""
  const css = [nodeCss, importedCss(document)].filter(Boolean).join("\n")
  return (
    <BuilderRuntimeProvider value={runtime ?? {}}>
      <div className={themeClass} dir="rtl">
        {css ? <style>{css}</style> : null}
        <div className="flex flex-col gap-6">
          {document.sections.map((section) => (
            <SectionBlock key={section.id} section={section} device={device} editor={editor} />
          ))}
        </div>
      </div>
    </BuilderRuntimeProvider>
  )
}

function SectionBlock({ section, device, editor }: { section: SectionNode; device: DeviceMode; editor?: EditorApi }) {
  const selected = editor?.selectedId === section.id
  const style = editor ? styleToCss(mergeStyle(section.style, device)) : undefined
  return (
    <section
      id={section.id}
      className={`${safeClass(section.id)} ${section.fullWidth ? "" : "mx-auto w-full max-w-6xl px-4"} ${selected ? "outline outline-2 outline-[#E16BA6]" : ""}`}
      style={style}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        editor.onSelect(section.id)
      }}
    >
      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: device === "mobile" ? "minmax(0,1fr)" : "repeat(12, minmax(0,1fr))",
          gap: "1rem",
        }}
      >
        {section.columns.map((column) => (
          <ColumnBlock key={column.id} column={column} device={device} editor={editor} />
        ))}
      </div>
    </section>
  )
}

function ColumnBlock({ column, device, editor }: { column: ColumnNode; device: DeviceMode; editor?: EditorApi }) {
  const span = spanFor(column.span, column.tabletSpan, column.mobileSpan, device)
  const selected = editor?.selectedId === column.id
  const style = editor ? styleToCss(mergeStyle(column.style, device)) : undefined
  return (
    <div
      className={`${safeClass(column.id)} relative min-w-0 ${selected ? "outline outline-2 outline-dashed outline-[#0C2D63]" : ""}`}
      style={{ ...style, gridColumn: `span ${device === "mobile" ? 1 : span}` }}
      onClick={(event) => {
        if (!editor) return
        event.stopPropagation()
        editor.onSelect(column.id)
      }}
    >
      {editor ? <DropSlot columnId={column.id} index={0} editor={editor} /> : null}
      <div className="flex flex-col">
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
  const style = editor ? styleToCss(mergeStyle(widget.style, device)) : undefined
  return (
    <div
      className={`${safeClass(widget.id)} ${selected ? "outline outline-2 outline-[#E16BA6]" : ""}`}
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
