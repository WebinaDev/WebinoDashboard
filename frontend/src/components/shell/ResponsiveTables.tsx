"use client"

import { useEffect } from "react"

/**
 * Responsive table pattern for every admin page.
 *
 * Under 768px each <table> inside the dashboard main area turns into a stack of
 * cards: one card per row, each cell rendered as "header label : value" (RTL aware).
 * Desktop keeps the normal table. Labels are read from the table's <thead>, so
 * existing pages need no changes. Opt out with data-wd-no-cards on the table.
 */
function labelTable(table: HTMLTableElement) {
  if (table.hasAttribute("data-wd-no-cards")) return
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1]
  if (!headRow) return
  const labels: string[] = []
  for (const th of Array.from(headRow.cells)) {
    const text = (th.textContent ?? "").replace(/\s+/g, " ").trim()
    for (let i = 0; i < Math.max(1, th.colSpan); i++) labels.push(text)
  }
  if (labels.length < 2) return
  if (!table.hasAttribute("data-wd-cards")) table.setAttribute("data-wd-cards", "")
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      const cells = Array.from(row.cells)
      if (cells.length === 1 && cells[0].colSpan > 1) {
        if (!row.hasAttribute("data-wd-full")) row.setAttribute("data-wd-full", "")
        continue
      }
      let col = 0
      cells.forEach((cell, idx) => {
        const label = labels[col] ?? ""
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label)
        const primary = idx === 0
        const actions = idx === cells.length - 1 && idx > 0 && !label
        if (cell.hasAttribute("data-wd-primary") !== primary) cell.toggleAttribute("data-wd-primary", primary)
        if (cell.hasAttribute("data-wd-actions") !== actions) cell.toggleAttribute("data-wd-actions", actions)
        col += Math.max(1, cell.colSpan)
      })
    }
  }
}

export function ResponsiveTables({ selector = ".wd-mobile-main" }: { selector?: string }) {
  useEffect(() => {
    const root = document.querySelector(selector)
    if (!root) return
    let raf = 0
    const run = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => root.querySelectorAll("table").forEach((t) => labelTable(t)))
    }
    run()
    const mo = new MutationObserver(run)
    mo.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
    }
  }, [selector])
  return null
}
