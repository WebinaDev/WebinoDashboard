"use client"

import { useEffect, useRef } from "react"

export type MenuItem = { id: string; label: string; shortcut?: string; disabled?: boolean; danger?: boolean; onSelect: () => void } | "sep"

/** Minimal accessible context menu (role=menu, arrow keys, Esc / outside click closes). */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    window.addEventListener("blur", onClose)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("blur", onClose)
    }
  }, [onClose])
  const left = typeof window === "undefined" ? x : Math.min(x, window.innerWidth - 230)
  const top = typeof window === "undefined" ? y : Math.min(y, window.innerHeight - items.length * 30 - 16)
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] w-56 rounded-xl border border-border bg-card p-1 text-xs text-foreground shadow-xl"
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
        event.preventDefault()
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }}
    >
      {items.map((item, index) =>
        item === "sep" ? (
          <div key={`sep-${index}`} className="my-1 h-px bg-border" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start hover:bg-muted focus:bg-muted focus:outline-none disabled:opacity-40 ${item.danger ? "text-red-600" : ""}`}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut ? <kbd className="text-[10px] text-foreground/50" dir="ltr">{item.shortcut}</kbd> : null}
          </button>
        ),
      )}
    </div>
  )
}
