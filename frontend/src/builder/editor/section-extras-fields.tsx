"use client"

/* Section «چیدمان و نقش» controls: fullBleed + eslimi pattern (keys: section.fullBleed, section.pattern.{enabled,opacity,color,scale}). */
import type { SectionNode, SectionPattern } from "../types"
import { PATTERN_DEFAULTS } from "../render/section-extras"
import { ColorInput } from "./fields"
import { Group } from "./style-panel"

export function SectionExtrasFields({ section, onChange }: { section: SectionNode; onChange: (patch: Partial<Pick<SectionNode, "fullBleed" | "pattern">>) => void }) {
  const pat: SectionPattern = section.pattern ?? {}
  const setPat = (patch: Partial<SectionPattern>) => onChange({ pattern: { ...pat, ...patch } })
  return (
    <Group title="تمام‌عرض و نقش پس‌زمینه">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span>تمام‌عرض واقعی (بیرون از کادر قالب، تا لبه صفحه)</span>
        <input type="checkbox" checked={section.fullBleed === true} onChange={(e) => onChange({ fullBleed: e.target.checked })} />
      </label>
      <small className="text-[10px] leading-4 text-[#0C2D63]/60">فقط وقتی «عرض در دسکتاپ» تمام‌عرض است اعمال می‌شود؛ در ویرایشگر داخل بوم نمایش داده می‌شود.</small>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span>نقش اسلیمی روی پس‌زمینه</span>
        <input type="checkbox" checked={pat.enabled === true} onChange={(e) => setPat({ enabled: e.target.checked })} />
      </label>
      {pat.enabled ? (
        <>
          <label className="grid gap-1 text-xs">
            <span>شدت نقش: {pat.opacity ?? PATTERN_DEFAULTS.opacity}٪</span>
            <input type="range" min={0} max={100} step={1} value={pat.opacity ?? PATTERN_DEFAULTS.opacity} onChange={(e) => setPat({ opacity: Number(e.target.value) })} />
          </label>
          <label className="grid gap-1 text-xs">
            <span>رنگ نقش</span>
            <ColorInput value={pat.color ?? PATTERN_DEFAULTS.color} onChange={(v) => setPat({ color: v })} />
          </label>
          <label className="grid gap-1 text-xs">
            <span>اندازه نقش (پیکسل): {pat.scale ?? PATTERN_DEFAULTS.scale}</span>
            <input type="range" min={24} max={400} step={4} value={pat.scale ?? PATTERN_DEFAULTS.scale} onChange={(e) => setPat({ scale: Number(e.target.value) })} />
          </label>
        </>
      ) : null}
    </Group>
  )
}
