"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MediaPickerField } from "@/components/content/MediaPickerField"
import { MapPinPicker } from "@/components/MapPinPicker"
import { DAY_LABELS } from "./view-utils"
import { DAY_KEYS, emptyBlock, type LinkHubBlock, type LinkHubBlockType } from "./types"

const TYPE_LABELS: Record<LinkHubBlockType, string> = {
  link: "لینک",
  contact: "تماس",
  form: "فرم",
  faq: "سوالات متداول",
  event: "رویداد",
  cta: "دکمهٔ ویژه",
  section: "عنوان بخش",
  image: "تصویر",
  gallery: "گالری",
  map: "نقشه",
  hours: "ساعت کاری",
}

const TEXTAREA = "border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm"

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1${wide ? " sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<[string, string]>
  label: string
}) {
  return (
    <select
      aria-label={label}
      className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

type Props = {
  blocks: LinkHubBlock[]
  onChange: (blocks: LinkHubBlock[]) => void
}

export function BlockEditor({ blocks, onChange }: Props) {
  function update(index: number, patch: Partial<LinkHubBlock>) {
    const next = blocks.map((b, i) => (i === index ? { ...b, ...patch } : b))
    onChange(next)
  }

  function updatePayload(index: number, payload: Record<string, unknown>) {
    update(index, { payload })
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[j]] = [next[j], next[index]]
    onChange(next.map((b, i) => ({ ...b, sort: i })))
  }

  function add(type: LinkHubBlockType) {
    onChange([...blocks, emptyBlock(type, blocks.length)])
  }

  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index).map((b, i) => ({ ...b, sort: i })))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPE_LABELS) as LinkHubBlockType[]).map((type) => (
          <Button key={type} type="button" size="sm" variant="outline" onClick={() => add(type)}>
            + {TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {blocks.length === 0 ? (
        <p className="text-muted-foreground text-sm">هنوز بلاکی اضافه نشده است.</p>
      ) : null}

      <ul className="space-y-3">
        {blocks.map((block, index) => (
          <li key={block.id ?? `new-${index}`} className="rounded-xl border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{TYPE_LABELS[block.type]}</div>
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => move(index, -1)}>
                  بالا
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move(index, 1)}>
                  پایین
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => update(index, { is_visible: !block.is_visible })}
                >
                  {block.is_visible ? "مخفی" : "نمایش"}
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => remove(index)}>
                  حذف
                </Button>
              </div>
            </div>
            <BlockFields
              block={block}
              onPayload={(payload) => updatePayload(index, payload)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function BlockFields({
  block,
  onPayload,
}: {
  block: LinkHubBlock
  onPayload: (payload: Record<string, unknown>) => void
}) {
  const p = block.payload

  if (block.type === "link") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>عنوان</Label>
          <Input
            value={String(p.label ?? "")}
            onChange={(e) => onPayload({ ...p, label: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>آدرس</Label>
          <Input
            value={String(p.url ?? "")}
            onChange={(e) => onPayload({ ...p, url: e.target.value })}
            dir="ltr"
          />
        </div>
      </div>
    )
  }

  if (block.type === "contact") {
    const socials = Array.isArray(p.socials) ? (p.socials as Array<{ label?: string; url?: string; value?: string }>) : []
    const phones = Array.isArray(p.phones) ? (p.phones as Array<{ label?: string; value?: string; whatsapp?: boolean }>) : []
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان گروه (اختیاری)" wide>
          <Input value={String(p.title ?? "")} onChange={(e) => onPayload({ ...p, title: e.target.value })} />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label>شماره‌های دیگر</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onPayload({ ...p, phones: [...phones, { label: "موبایل", value: "", whatsapp: false }] })}
            >
              + شماره
            </Button>
          </div>
          {phones.map((row, i) => (
            <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1.2fr_auto_auto]">
              <Input
                placeholder="عنوان"
                value={row.label ?? ""}
                onChange={(e) => onPayload({ ...p, phones: phones.map((r, k) => (k === i ? { ...r, label: e.target.value } : r)) })}
              />
              <Input
                placeholder="09xxxxxxxxx"
                dir="ltr"
                value={row.value ?? ""}
                onChange={(e) => onPayload({ ...p, phones: phones.map((r, k) => (k === i ? { ...r, value: e.target.value } : r)) })}
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(row.whatsapp)}
                  onChange={(e) => onPayload({ ...p, phones: phones.map((r, k) => (k === i ? { ...r, whatsapp: e.target.checked } : r)) })}
                />
                واتساپ
              </label>
              <Button type="button" size="sm" variant="ghost" onClick={() => onPayload({ ...p, phones: phones.filter((_, k) => k !== i) })}>
                حذف
              </Button>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <Label>تلفن</Label>
          <Input
            value={String(p.phone ?? "")}
            onChange={(e) => onPayload({ ...p, phone: e.target.value })}
            dir="ltr"
          />
        </div>
        <div className="space-y-1">
          <Label>ایمیل</Label>
          <Input
            value={String(p.email ?? "")}
            onChange={(e) => onPayload({ ...p, email: e.target.value })}
            dir="ltr"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label>شبکه‌های اجتماعی</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onPayload({
                  ...p,
                  socials: [...socials, { label: "اینستاگرام", url: "https://instagram.com/" }],
                })
              }
            >
              + شبکه
            </Button>
          </div>
          <div className="space-y-2">
            {socials.map((row, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
                <Input
                  placeholder="عنوان (مثلاً تلگرام)"
                  value={row.label ?? ""}
                  onChange={(e) => {
                    const next = socials.map((s, idx) =>
                      idx === i ? { ...s, label: e.target.value } : s
                    )
                    onPayload({ ...p, socials: next })
                  }}
                />
                <Input
                  placeholder="https://"
                  value={row.url ?? ""}
                  dir="ltr"
                  onChange={(e) => {
                    const next = socials.map((s, idx) =>
                      idx === i ? { ...s, url: e.target.value } : s
                    )
                    onPayload({ ...p, socials: next })
                  }}
                />
                <Input
                  placeholder="متن نمایشی (مثلاً @handle)"
                  value={row.value ?? ""}
                  dir="ltr"
                  onChange={(e) => {
                    const next = socials.map((s, idx) => (idx === i ? { ...s, value: e.target.value } : s))
                    onPayload({ ...p, socials: next })
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onPayload({ ...p, socials: socials.filter((_, idx) => idx !== i) })
                  }
                >
                  حذف
                </Button>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs leading-5">
            آیکن رسمی از روی عنوان یا نشانی تشخیص داده می‌شود: اینستاگرام، تلگرام، واتساپ، لینکدین، بله، ایتا، روبیکا، گپ و آیگپ. کنار هر ردیف دکمهٔ کپی نمایش داده می‌شود.
          </p>
        </div>
      </div>
    )
  }

  if (block.type === "form") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>عنوان فرم</Label>
          <Input
            value={String(p.title ?? "")}
            onChange={(e) => onPayload({ ...p, title: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>متن دکمه</Label>
          <Input
            value={String(p.submit_label ?? "")}
            onChange={(e) => onPayload({ ...p, submit_label: e.target.value })}
          />
        </div>
        <Field label="توضیح (اختیاری)">
          <Input value={String(p.description ?? "")} onChange={(e) => onPayload({ ...p, description: e.target.value })} />
        </Field>
        <Field label="پیام پس از ارسال">
          <Input value={String(p.success_message ?? "")} onChange={(e) => onPayload({ ...p, success_message: e.target.value })} />
        </Field>
      </div>
    )
  }

  if (block.type === "faq") {
    return (
      <div className="space-y-1">
        <Label>سوالات (هر دو خط: سوال سپس پاسخ، با خط خالی جدا)</Label>
        <textarea
          className="border-input bg-background min-h-32 w-full rounded-md border px-3 py-2 text-sm"
          value={faqToText(p.items)}
          onChange={(e) => onPayload({ ...p, items: textToFaq(e.target.value), title: p.title ?? "سوالات متداول" })}
        />
      </div>
    )
  }


  if (block.type === "cta") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان">
          <Input value={String(p.label ?? "")} onChange={(e) => onPayload({ ...p, label: e.target.value })} />
        </Field>
        <Field label="زیرعنوان (مثلاً شماره)">
          <Input value={String(p.sublabel ?? "")} onChange={(e) => onPayload({ ...p, sublabel: e.target.value })} />
        </Field>
        <Field label="پیوند (tel:، https://، mailto:)">
          <Input dir="ltr" value={String(p.url ?? "")} onChange={(e) => onPayload({ ...p, url: e.target.value })} />
        </Field>
        <Field label="آیکن">
          <Select
            label="آیکن"
            value={String(p.icon ?? "link")}
            onChange={(v) => onPayload({ ...p, icon: v })}
            options={[
              ["phone", "تلفن"],
              ["message", "پیام"],
              ["mail", "ایمیل"],
              ["web", "وب‌سایت"],
              ["map", "نقشه"],
              ["menu", "منو"],
              ["calendar", "رزرو"],
              ["sparkles", "ویژه"],
              ["link", "لینک"],
            ]}
          />
        </Field>
        <Field label="نوع نمایش">
          <Select
            label="نوع نمایش"
            value={String(p.variant ?? "primary")}
            onChange={(v) => onPayload({ ...p, variant: v })}
            options={[
              ["primary", "کارت اصلی با گرادیان"],
              ["secondary", "کارت ساده"],
              ["chip", "دکمهٔ کوچک"],
            ]}
          />
        </Field>
        <p className="text-muted-foreground text-xs leading-5 sm:col-span-2">
          دکمه‌های ویژه همیشه زیر معرفی نمایش داده می‌شوند (در دسکتاپ در ستون کناری). برند واتساپ و تلگرام از روی پیوند شناخته می‌شود.
        </p>
      </div>
    )
  }

  if (block.type === "section") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان بخش">
          <Input value={String(p.title ?? "")} onChange={(e) => onPayload({ ...p, title: e.target.value })} />
        </Field>
        <Field label="توضیح کوتاه">
          <Input value={String(p.subtitle ?? "")} onChange={(e) => onPayload({ ...p, subtitle: e.target.value })} />
        </Field>
      </div>
    )
  }

  if (block.type === "image") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <MediaPickerField
            label="تصویر"
            imageUrl={String(p.url ?? "")}
            onPick={(item) => onPayload({ ...p, url: item.url, alt: p.alt || item.alt || "" })}
            onClear={() => onPayload({ ...p, url: "" })}
          />
        </div>
        <Field label="متن جایگزین">
          <Input value={String(p.alt ?? "")} onChange={(e) => onPayload({ ...p, alt: e.target.value })} />
        </Field>
        <Field label="زیرنویس">
          <Input value={String(p.caption ?? "")} onChange={(e) => onPayload({ ...p, caption: e.target.value })} />
        </Field>
        <Field label="پیوند هنگام کلیک (اختیاری)" wide>
          <Input dir="ltr" value={String(p.href ?? "")} onChange={(e) => onPayload({ ...p, href: e.target.value })} />
        </Field>
      </div>
    )
  }

  if (block.type === "gallery") {
    const images = Array.isArray(p.images) ? (p.images as Array<{ url: string; alt?: string; caption?: string }>) : []
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان">
          <Input value={String(p.title ?? "")} onChange={(e) => onPayload({ ...p, title: e.target.value })} />
        </Field>
        <Field label="چیدمان">
          <Select
            label="چیدمان"
            value={String(p.layout ?? "grid")}
            onChange={(v) => onPayload({ ...p, layout: v })}
            options={[
              ["grid", "شبکه‌ای"],
              ["carousel", "اسلایدی"],
            ]}
          />
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <MediaPickerField
            label="افزودن تصویر"
            imageUrl=""
            onPick={(item) => onPayload({ ...p, images: [...images, { url: item.url, alt: item.alt ?? "" }] })}
          />
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img, i) => (
              <li key={img.url + i} className="space-y-1 rounded-lg border p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt ?? ""} className="aspect-square w-full rounded object-cover" />
                <Input
                  placeholder="متن جایگزین"
                  value={img.alt ?? ""}
                  onChange={(e) => onPayload({ ...p, images: images.map((r, k) => (k === i ? { ...r, alt: e.target.value } : r)) })}
                />
                <div className="flex justify-between">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="جابه‌جایی به قبل"
                    onClick={() => {
                      if (i === 0) return
                      const next = [...images]
                      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                      onPayload({ ...p, images: next })
                    }}
                  >
                    →
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onPayload({ ...p, images: images.filter((_, k) => k !== i) })}>
                    حذف
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  if (block.type === "map") {
    const lat = typeof p.lat === "number" ? p.lat : p.lat ? Number(p.lat) : null
    const lng = typeof p.lng === "number" ? p.lng : p.lng ? Number(p.lng) : null
    const value = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان">
          <Input value={String(p.title ?? "")} onChange={(e) => onPayload({ ...p, title: e.target.value })} />
        </Field>
        <Field label="بزرگ‌نمایی (۳ تا ۱۹)">
          <Input
            type="number"
            min={3}
            max={19}
            value={String(p.zoom ?? 16)}
            onChange={(e) => onPayload({ ...p, zoom: Number(e.target.value) })}
          />
        </Field>
        <Field label="نشانی متنی" wide>
          <Input value={String(p.address ?? "")} onChange={(e) => onPayload({ ...p, address: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <MapPinPicker
            value={value}
            onChange={(v) => onPayload({ ...p, lat: Number(v.lat.toFixed(7)), lng: Number(v.lng.toFixed(7)) })}
            labels={{ hint: "روی نقشه کلیک کنید یا نشانگر را بکشید.", locate: "موقعیت من", failed: "نقشه بارگذاری نشد." }}
          />
        </div>
        <Field label="عرض جغرافیایی">
          <Input dir="ltr" value={lat === null ? "" : String(lat)} onChange={(e) => onPayload({ ...p, lat: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="طول جغرافیایی">
          <Input dir="ltr" value={lng === null ? "" : String(lng)} onChange={(e) => onPayload({ ...p, lng: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>
        <Field label="پیوند مسیریابی (اختیاری، پیش‌فرض OpenStreetMap)" wide>
          <Input dir="ltr" value={String(p.directions_url ?? "")} onChange={(e) => onPayload({ ...p, directions_url: e.target.value })} />
        </Field>
        <p className="text-muted-foreground text-xs sm:col-span-2">بدون مختصات معتبر، این بلاک در صفحه نمایش داده نمی‌شود.</p>
      </div>
    )
  }

  if (block.type === "hours") {
    const days = Array.isArray(p.days) ? (p.days as Array<{ day: string; open?: string; close?: string; closed?: boolean }>) : []
    const byDay = new Map(days.map((d) => [d.day, d]))
    const rows = DAY_KEYS.map((day) => byDay.get(day) ?? { day, open: "", close: "", closed: false })
    const setRow = (day: string, patch: Record<string, unknown>) =>
      onPayload({ ...p, days: rows.map((r) => (r.day === day ? { ...r, ...patch } : r)) })
    const fromCafe = p.source === "cafe"
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان">
          <Input value={String(p.title ?? "")} onChange={(e) => onPayload({ ...p, title: e.target.value })} />
        </Field>
        <Field label="منبع ساعت‌ها">
          <Select
            label="منبع ساعت‌ها"
            value={fromCafe ? "cafe" : "manual"}
            onChange={(v) => onPayload({ ...p, source: v })}
            options={[
              ["manual", "دستی"],
              ["cafe", "تنظیمات ساعت کاری کافه"],
            ]}
          />
        </Field>
        <Field label="یادداشت (اختیاری)" wide>
          <Input value={String(p.note ?? "")} onChange={(e) => onPayload({ ...p, note: e.target.value })} />
        </Field>
        {fromCafe ? (
          <p className="text-muted-foreground text-xs sm:col-span-2">
            ساعت‌ها از تنظیمات کافه خوانده می‌شود. اگر آن تنظیمات خالی باشد، ساعت‌های دستی زیر نمایش داده می‌شود. روزهای بدون ساعت معتبر «ندارد» نمایش داده می‌شوند.
          </p>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          {rows.map((r) => (
            <div key={r.day} className="grid grid-cols-[5rem_1fr_1fr_auto] items-center gap-2">
              <span className="text-sm">{DAY_LABELS[r.day]}</span>
              <Input type="time" dir="ltr" aria-label={`شروع ${DAY_LABELS[r.day]}`} disabled={r.closed} value={r.open ?? ""} onChange={(e) => setRow(r.day, { open: e.target.value })} />
              <Input type="time" dir="ltr" aria-label={`پایان ${DAY_LABELS[r.day]}`} disabled={r.closed} value={r.close ?? ""} onChange={(e) => setRow(r.day, { close: e.target.value })} />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={Boolean(r.closed)} onChange={(e) => setRow(r.day, { closed: e.target.checked })} />
                تعطیل
              </label>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label>عنوان رویداد</Label>
        <Input
          value={String(p.title ?? "")}
          onChange={(e) => onPayload({ ...p, title: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>زمان</Label>
        <Input
          value={String(p.datetime ?? "")}
          onChange={(e) => onPayload({ ...p, datetime: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>متن دکمه</Label>
        <Input
          value={String(p.cta_label ?? "")}
          onChange={(e) => onPayload({ ...p, cta_label: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>لینک دکمه</Label>
        <Input
          value={String(p.cta_url ?? "")}
          onChange={(e) => onPayload({ ...p, cta_url: e.target.value })}
          dir="ltr"
        />
      </div>
    </div>
  )
}

function faqToText(value: unknown): string {
  if (!Array.isArray(value)) return ""
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return ""
      const row = item as { q?: string; a?: string }
      return `${row.q ?? ""}\n${row.a ?? ""}`
    })
    .filter(Boolean)
    .join("\n\n")
}

function textToFaq(text: string): Array<{ q: string; a: string }> {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n")
      return { q: lines[0] ?? "", a: lines.slice(1).join("\n") }
    })
}
