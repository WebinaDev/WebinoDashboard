"use client"

import { Palette, X } from "lucide-react"
import { KIT_PRESETS, applyKitPreset, type KitPreset } from "@webina/ui/builder"

import type { BuilderGlobals } from "../globals"

/**
 * Builder Phase 8 — kit presets: apply a complete colour + button kit to the site's global design in one click.
 * Only colours, palette and button variants change; fonts (Yekan Bakh), classes and components are kept.
 */
export function KitPresetsPanel({ globals, onApply, onClose }: { globals: BuilderGlobals; onApply: (next: BuilderGlobals) => void; onClose: () => void }) {
  const current = globals.colors.primary?.toLowerCase()
  const pick = (preset: KitPreset) => {
    onApply(applyKitPreset(globals, preset))
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="کیت‌های آماده" dir="rtl" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-4 text-[#0C2D63] shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between text-sm font-bold">
          <span className="flex items-center gap-1.5"><Palette className="size-4" aria-hidden />کیت‌های آماده</span>
          <button type="button" aria-label="بستن" onClick={onClose}><X className="size-4" /></button>
        </div>
        <p className="mb-3 text-xs text-[#0C2D63]/70">رنگ‌ها و دکمه‌های کل سایت با یک کلیک عوض می‌شوند. فونت‌ها و کلاس‌ها دست نمی‌خورند و از «نسخه‌ها» قابل برگشت است.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {KIT_PRESETS.map((preset) => {
            const c = preset.colors
            const on = current === c.primary.toLowerCase()
            return (
              <button key={preset.id} type="button" onClick={() => pick(preset)} className={`rounded-xl border p-3 text-start transition hover:shadow ${on ? "border-[#E16BA6] ring-2 ring-[#E16BA6]/30" : "border-[#e6eef6]"}`} style={{ background: c.background, color: c.text }}>
                <span className="mb-2 flex gap-1" aria-hidden>
                  {[c.primary, c.secondary, c.accent, c.surface].map((v, i) => <span key={i} className="size-5 rounded-full border border-black/10" style={{ background: v }} />)}
                </span>
                <span className="block text-sm font-bold">{preset.name}</span>
                <span className="mt-2 inline-block px-3 py-1 text-xs font-bold" style={{ background: c.primary, color: preset.id === "shab" ? "#0F1220" : "#fff", borderRadius: preset.radius }}>دکمه نمونه</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
