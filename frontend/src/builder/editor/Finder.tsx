"use client"

import { Search } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { WIDGETS } from "../registry"
import { widgetLabel } from "../render/widgets"
import type { BuilderDocument, SectionNode } from "../types"

export type FinderAction = { id: string; label: string; run: () => void }
type Item = { key: string; group: "action" | "widget" | "element"; label: string; run: () => void }

function collect(sections: SectionNode[], out: { id: string; label: string }[]) {
  for (const section of sections) {
    out.push({ id: section.id, label: section.label || `section · ${section.id.slice(0, 6)}` })
    for (const column of section.columns) {
      for (const widget of column.widgets) {
        out.push({ id: widget.id, label: widget.label || `${widget.type} · ${widgetLabel(widget).slice(0, 40)}` })
        if (widget.children) collect(widget.children, out)
      }
    }
  }
}

/** Ctrl+E finder: run editor actions, add widgets, or jump to an element. */
export function Finder({
  doc,
  actions,
  onAdd,
  onSelect,
  onClose,
}: {
  doc: BuilderDocument
  actions: FinderAction[]
  onAdd: (type: string) => void
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const t = useTranslations("builder")
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const match = (text: string) => !q || text.toLowerCase().includes(q)
    const elements: { id: string; label: string }[] = []
    collect(doc.sections, elements)
    return [
      ...actions.filter((a) => match(a.label)).map((a) => ({ key: `a-${a.id}`, group: "action" as const, label: a.label, run: a.run })),
      ...WIDGETS.filter((w) => match(`${w.label} ${w.type}`)).map((w) => ({ key: `w-${w.type}`, group: "widget" as const, label: w.label, run: () => onAdd(w.type) })),
      ...elements.filter((e) => match(e.label)).map((e) => ({ key: `e-${e.id}`, group: "element" as const, label: e.label, run: () => onSelect(e.id) })),
    ].slice(0, 40)
  }, [actions, doc.sections, onAdd, onSelect, query])

  function choose(item: Item | undefined) {
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" role="dialog" aria-modal="true" aria-label={t("finder")} onClick={onClose}>
      <div className="w-[520px] max-w-[92vw] overflow-hidden rounded-2xl bg-card text-foreground shadow-xl" onClick={(event) => event.stopPropagation()}>
        <label className="flex items-center gap-2 border-b px-3">
          <Search className="size-4" aria-hidden />
          <input
            autoFocus
            className="h-12 flex-1 bg-transparent text-sm outline-none"
            placeholder={t("finder_placeholder")}
            value={query}
            aria-label={t("finder")}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActive((i) => Math.min(items.length - 1, i + 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setActive((i) => Math.max(0, i - 1))
              } else if (event.key === "Enter") {
                event.preventDefault()
                choose(items[active])
              } else if (event.key === "Escape") {
                onClose()
              }
            }}
          />
        </label>
        <ul className="max-h-80 overflow-auto p-1 text-sm" role="listbox">
          {items.map((item, index) => (
            <li key={item.key} role="option" aria-selected={index === active}>
              <button type="button" className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-start ${index === active ? "bg-muted text-primary" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>
                <span className="truncate">{item.label}</span>
                <span className="text-[10px] text-foreground/50">{t(`finder_${item.group}`)}</span>
              </button>
            </li>
          ))}
          {items.length === 0 ? <li className="px-3 py-4 text-xs text-foreground/60">{t("finder_empty")}</li> : null}
        </ul>
      </div>
    </div>
  )
}
