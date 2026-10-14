"use client"

import { X } from "lucide-react"
import { useTranslations } from "next-intl"

const ROWS: [string, string][] = [
  ["Ctrl+S", "sc_save"],
  ["Ctrl+Shift+S", "sc_publish"],
  ["Ctrl+Z", "sc_undo"],
  ["Ctrl+Shift+Z / Ctrl+Y", "sc_redo"],
  ["Ctrl+C", "sc_copy"],
  ["Ctrl+X", "sc_cut"],
  ["Ctrl+V", "sc_paste"],
  ["Ctrl+Shift+V", "sc_paste_style"],
  ["Ctrl+D", "sc_duplicate"],
  ["Delete", "sc_delete"],
  ["Ctrl+P", "sc_device"],
  ["Esc", "sc_deselect"],
  ["?", "sc_help"],
]

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const t = useTranslations("builder")
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t("shortcuts")} onClick={onClose} onKeyDown={(event) => { if (event.key === "Escape") onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-4 text-[#0C2D63] shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between text-sm font-bold">
          {t("shortcuts")}
          <button type="button" autoFocus aria-label={t("close")} onClick={onClose}><X className="size-4" /></button>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {ROWS.map(([keys, label]) => (
              <tr key={keys} className="border-t border-[#e6eef6]">
                <td className="py-1.5">{t(label as "sc_save")}</td>
                <td className="py-1.5 text-end"><kbd dir="ltr" className="rounded bg-[#f7f9fc] px-1.5 py-0.5">{keys}</kbd></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-[#0C2D63]/60">{t("sc_note")}</p>
      </div>
    </div>
  )
}
