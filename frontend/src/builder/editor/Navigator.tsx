"use client"

import { Blocks, ChevronDown, ChevronLeft, Eye, EyeOff, ListTree, Lock, LockOpen } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { moveSection, patchNode } from "../ops"
import { widgetLabel } from "../render/widgets"
import { WidgetGlyph } from "../theme/icons"
import { moveWidget } from "../tree"
import type { BuilderDocument, ColumnNode, SectionNode, WidgetNode } from "../types"

const DND_NAV = "application/x-webino-nav"

type Props = {
  doc: BuilderDocument
  selectedId: string | null
  onSelect: (id: string) => void
  commit: (doc: BuilderDocument) => void
  onContextMenu: (id: string, x: number, y: number) => void
}

type Drag = { kind: "widget" | "section"; id: string }

function readDrag(event: React.DragEvent): Drag | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(DND_NAV)) as Drag
    return value?.id ? value : null
  } catch {
    return null
  }
}

/** Layers tree: drag to reorder (widgets across columns, top-level sections), double-click to rename, hide and lock. */
export function Navigator(props: Props) {
  return (
    <nav className="min-h-0 flex-1 overflow-auto p-2 text-sm" aria-label="navigator">
      <SectionList sections={props.doc.sections} depth={0} topLevel {...props} />
    </nav>
  )
}

function SectionList({ sections, depth, topLevel = false, ...props }: Props & { sections: SectionNode[]; depth: number; topLevel?: boolean }) {
  return (
    <>
      {sections.map((section, index) => (
        <SectionRow key={section.id} section={section} index={index} depth={depth} topLevel={topLevel} {...props} />
      ))}
    </>
  )
}

function Row({
  id,
  depth,
  node,
  fallback,
  icon,
  open,
  onToggle,
  drag,
  onDropHere,
  ...props
}: Props & {
  id: string
  depth: number
  node: { label?: string; hidden?: boolean; locked?: boolean }
  fallback: string
  icon: React.ReactNode
  open?: boolean
  onToggle?: () => void
  drag?: Drag
  onDropHere?: (drag: Drag) => void
}) {
  const t = useTranslations("builder")
  const [editing, setEditing] = useState(false)
  const [over, setOver] = useState(false)
  const selected = props.selectedId === id
  return (
    <div
      className={`group flex items-center gap-1 rounded-md py-0.5 pe-1 text-xs ${selected ? "bg-white text-[#E16BA6]" : "hover:bg-white/70"} ${over ? "ring-1 ring-[#E16BA6]" : ""} ${node.hidden ? "opacity-50" : ""}`}
      style={{ paddingInlineStart: depth * 12 + 4 }}
      draggable={Boolean(drag) && !node.locked && !editing}
      onDragStart={drag ? (event) => {
        event.stopPropagation()
        event.dataTransfer.setData(DND_NAV, JSON.stringify(drag))
        event.dataTransfer.effectAllowed = "move"
      } : undefined}
      onDragOver={onDropHere ? (event) => {
        if (!event.dataTransfer.types.includes(DND_NAV)) return
        event.preventDefault()
        setOver(true)
      } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDropHere ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        setOver(false)
        const value = readDrag(event)
        if (value && value.id !== id) onDropHere(value)
      } : undefined}
      onContextMenu={(event) => {
        event.preventDefault()
        props.onContextMenu(id, event.clientX, event.clientY)
      }}
    >
      {onToggle ? (
        <button type="button" aria-label={open ? t("collapse") : t("expand")} onClick={onToggle} className="grid size-4 place-items-center">
          {open ? <ChevronDown className="size-3" /> : <ChevronLeft className="size-3" />}
        </button>
      ) : <span className="size-4" />}
      {icon}
      {editing ? (
        <input
          autoFocus
          className="h-6 min-w-0 flex-1 rounded border px-1"
          defaultValue={node.label ?? ""}
          placeholder={fallback}
          aria-label={t("rename")}
          onBlur={(event) => {
            setEditing(false)
            props.commit(patchNode(props.doc, id, { label: event.target.value.trim() || undefined }))
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur()
            if (event.key === "Escape") setEditing(false)
          }}
        />
      ) : (
        <button type="button" className="min-w-0 flex-1 truncate text-start" onClick={() => props.onSelect(id)} onDoubleClick={() => setEditing(true)} title={t("rename_hint")}>
          {node.label || fallback}
        </button>
      )}
      <button type="button" aria-label={node.hidden ? t("show_node") : t("hide_node")} aria-pressed={Boolean(node.hidden)} className={`grid size-5 place-items-center ${node.hidden ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`} onClick={() => props.commit(patchNode(props.doc, id, { hidden: node.hidden ? undefined : true }))}>
        {node.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
      <button type="button" aria-label={node.locked ? t("unlock_node") : t("lock_node")} aria-pressed={Boolean(node.locked)} className={`grid size-5 place-items-center ${node.locked ? "" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`} onClick={() => props.commit(patchNode(props.doc, id, { locked: node.locked ? undefined : true }))}>
        {node.locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
      </button>
    </div>
  )
}

function contains(node: WidgetNode, columnId: string): boolean {
  return JSON.stringify(node.children ?? []).includes(`"id":"${columnId}"`)
}

function moveInto(props: Props, drag: Drag, columnId: string, index: number) {
  if (drag.kind !== "widget") return
  const hit = JSON.stringify(props.doc)
  if (!hit.includes(`"id":"${drag.id}"`)) return
  // Never drop a container into itself.
  const find = (sections: SectionNode[]): WidgetNode | null => {
    for (const s of sections) for (const c of s.columns) for (const w of c.widgets) {
      if (w.id === drag.id) return w
      const inner = w.children ? find(w.children) : null
      if (inner) return inner
    }
    return null
  }
  const widget = find(props.doc.sections)
  if (!widget || contains(widget, columnId)) return
  props.commit(moveWidget(props.doc, drag.id, columnId, index))
}

function SectionRow({ section, index, depth, topLevel, ...props }: Props & { section: SectionNode; index: number; depth: number; topLevel: boolean }) {
  const t = useTranslations("builder")
  const [open, setOpen] = useState(true)
  return (
    <div>
      <Row
        {...props}
        id={section.id}
        depth={depth}
        node={section}
        fallback={`${t("section")} ${index + 1}`}
        icon={<Blocks className="size-3.5 shrink-0" aria-hidden />}
        open={open}
        onToggle={() => setOpen(!open)}
        drag={topLevel ? { kind: "section", id: section.id } : undefined}
        onDropHere={topLevel ? (drag) => {
          if (drag.kind === "section") props.commit(moveSection(props.doc, drag.id, props.doc.sections.findIndex((s) => s.id === section.id)))
        } : undefined}
      />
      {open ? section.columns.map((column, colIndex) => <ColumnRow key={column.id} column={column} index={colIndex} depth={depth + 1} {...props} />) : null}
    </div>
  )
}

function ColumnRow({ column, index, depth, ...props }: Props & { column: ColumnNode; index: number; depth: number }) {
  const t = useTranslations("builder")
  const [open, setOpen] = useState(true)
  return (
    <div>
      <Row
        {...props}
        id={column.id}
        depth={depth}
        node={column}
        fallback={`${t("column")} ${index + 1}`}
        icon={<ListTree className="size-3 shrink-0" aria-hidden />}
        open={open}
        onToggle={() => setOpen(!open)}
        onDropHere={(drag) => moveInto(props, drag, column.id, column.widgets.length)}
      />
      {open
        ? column.widgets.map((widget, widgetIndex) => (
            <div key={widget.id}>
              <Row
                {...props}
                id={widget.id}
                depth={depth + 1}
                node={widget}
                fallback={widgetLabel(widget)}
                icon={<WidgetGlyph type={widget.type} className="size-3.5 shrink-0" />}
                drag={{ kind: "widget", id: widget.id }}
                onDropHere={(drag) => moveInto(props, drag, column.id, widgetIndex)}
              />
              {widget.children ? <SectionList sections={widget.children} depth={depth + 2} {...props} /> : null}
            </div>
          ))
        : null}
    </div>
  )
}
