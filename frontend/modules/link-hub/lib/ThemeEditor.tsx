"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LinkHubTheme } from "./types"
import { normalizeTheme } from "./view-utils"

const GRADIENTS: Array<[NonNullable<LinkHubTheme["hero_gradient"]>, string]> = [
  ["accent", "رنگ برند"],
  ["aurora", "شفق"],
  ["ocean", "اقیانوس"],
  ["sunset", "غروب"],
  ["night", "شب"],
  ["none", "بدون گرادیان"],
]

const CARDS: Array<[NonNullable<LinkHubTheme["card_style"]>, string]> = [
  ["soft", "نرم با سایه"],
  ["outline", "خطی"],
  ["glass", "شیشه‌ای"],
  ["solid", "توپر"],
]

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<[T, string]>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full border px-3 py-1 text-xs transition ${value === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border" />
        <Input dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </div>
  )
}

export function ThemeEditor({ value, onChange }: { value: LinkHubTheme; onChange: (next: LinkHubTheme) => void }) {
  const t = normalizeTheme(value)
  const set = (patch: Partial<LinkHubTheme>) => onChange({ ...value, ...patch })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label>چیدمان صفحه</Label>
        <Segmented
          label="چیدمان صفحه"
          value={value.layout === "spotlight" ? "spotlight" : "classic"}
          onChange={(v) => set({ layout: v })}
          options={[
            ["classic", "کلاسیک"],
            ["spotlight", "اسپات‌لایت (پرتره و انیمیشن)"],
          ]}
        />
      </div>
      <div className="space-y-1">
        <Label>زبان‌ها</Label>
        <Segmented
          label="زبان‌ها"
          value={(value.locales?.length ?? 0) > 1 ? (value.default_locale === "en" ? "en" : "fa") : "single"}
          onChange={(v) => set(v === "single" ? { locales: undefined, default_locale: undefined } : { locales: ["fa", "en"], default_locale: v })}
          options={[
            ["single", "فقط فارسی"],
            ["fa", "دوزبانه، پیش‌فرض فارسی"],
            ["en", "دوزبانه، پیش‌فرض انگلیسی"],
          ]}
        />
      </div>
      <div className="space-y-1">
        <Label>برچسب بالای عنوان</Label>
        <Input value={value.kicker ?? ""} placeholder="مثلاً آژانس توسعه کسب‌وکار" onChange={(e) => set({ kicker: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>عنوان اصلی (پیش‌فرض: نام صفحه)</Label>
        <Input value={value.headline ?? ""} placeholder="مثلاً خط مستقیم با" onChange={(e) => set({ headline: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>واژهٔ رنگی در عنوان</Label>
        <Input value={value.headline_accent ?? ""} placeholder="مثلاً نام برند" onChange={(e) => set({ headline_accent: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>یادداشت پایین صفحه</Label>
        <Input value={value.footer_note ?? ""} onChange={(e) => set({ footer_note: e.target.value })} />
      </div>
      <ColorField label="رنگ برند" value={t.accent} onChange={(v) => set({ accent: v })} />
      <ColorField label="رنگ پس‌زمینه" value={t.background} onChange={(v) => set({ background: v })} />
      <div className="space-y-1">
        <Label>حالت نمایش</Label>
        <Segmented
          label="حالت نمایش"
          value={t.mode}
          onChange={(v) => set({ mode: v, background: value.background && value.mode !== v ? undefined : value.background })}
          options={[
            ["light", "روشن"],
            ["dark", "تیره"],
          ]}
        />
      </div>
      <div className="space-y-1">
        <Label>فونت</Label>
        <Segmented
          label="فونت"
          value={t.font}
          onChange={(v) => set({ font: v })}
          options={[
            ["yekan-bakh", "یکان بخ"],
            ["system", "فونت سیستم"],
          ]}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>گرادیان معرفی و دکمه‌های ویژه</Label>
        <Segmented label="گرادیان" value={t.hero_gradient} onChange={(v) => set({ hero_gradient: v })} options={GRADIENTS} />
      </div>
      <div className="space-y-1">
        <Label>سبک کارت‌ها</Label>
        <Segmented label="سبک کارت‌ها" value={t.card_style} onChange={(v) => set({ card_style: v })} options={CARDS} />
      </div>
      <div className="space-y-1">
        <Label>گردی گوشه‌ها: {new Intl.NumberFormat("fa-IR").format(t.radius)} پیکسل</Label>
        <input
          type="range"
          min={0}
          max={32}
          value={t.radius}
          aria-label="گردی گوشه‌ها"
          onChange={(e) => set({ radius: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  )
}
