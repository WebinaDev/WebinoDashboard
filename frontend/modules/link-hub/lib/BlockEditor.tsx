"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { emptyBlock, type LinkHubBlock, type LinkHubBlockType } from "./types"

const TYPE_LABELS: Record<LinkHubBlockType, string> = {
  link: "لینک",
  contact: "تماس",
  form: "فرم",
  faq: "سوالات متداول",
  event: "رویداد",
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
    const socials = Array.isArray(p.socials) ? (p.socials as Array<{ label?: string; url?: string }>) : []
    return (
      <div className="grid gap-3 sm:grid-cols-2">
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
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
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
            برای آیکن رسمی، عنوان را مثل اینستاگرام، تلگرام، واتساپ، لینکدین، بله، ایتا یا روبیکا بگذارید.
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
