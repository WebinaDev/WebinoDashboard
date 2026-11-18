"use client"

/* Stepped cart/checkout settings: steps (enable + order + label), every field (enabled, required, label,
 * order), delivery-time scope and slots, payment layout. API: GET/PUT /api/v1/shop/checkout-flow. */

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { SettingsSaveBar } from "@/views/settings/use-tenant-settings"

type Step = { key: string; label: string; enabled: boolean; order: number }
type Field = { key: string; label: string; enabled: boolean; required: boolean; type?: string; order: number }
type Slot = { id: string; label: string; from: string; to: string; enabled: boolean }
type Flow = {
  stepped: boolean
  steps: Step[]
  fields: Record<string, Field[]>
  delivery_time: {
    mode: "all" | "methods"
    shipping_methods: (string | number)[]
    days_ahead: number
    min_lead_days: number
    same_day_cutoff: string
    closed_weekdays: number[]
    closed_dates: string[]
    slots: Slot[]
  }
  payment: { gateway_layout: string; gateway_order: string[]; hidden_gateways: string[]; terms_url: string }
}

const STEP_FA: Record<string, string> = { address: "آدرس", delivery_time: "زمان ارسال", shipping: "روش ارسال", payment: "پرداخت" }
const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function byOrder<T extends { order: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.order - b.order)
}

function move<T extends { order: number }>(rows: T[], i: number, dir: -1 | 1): T[] {
  const sorted = byOrder(rows)
  const j = i + dir
  if (j < 0 || j >= sorted.length) return sorted
  ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
  return sorted.map((r, k) => ({ ...r, order: k + 1 }))
}

export function CheckoutFlowPanel() {
  const fa = useLocale() !== "en"
  const tx = (f: string, e: string) => (fa ? f : e)
  const [flow, setFlow] = useState<Flow | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ settings: Flow }>("/api/v1/shop/checkout-flow")
      .then((r) => setFlow(r.settings))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [])

  async function save() {
    if (!flow) return
    setPending(true)
    setError(null)
    try {
      const r = await api<{ settings: Flow }>("/api/v1/shop/checkout-flow", { method: "PUT", json: { data: flow } })
      setFlow(r.settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setPending(false)
    }
  }

  if (!flow) return <p className="text-sm text-muted-foreground">{error ?? tx("در حال بارگذاری…", "Loading…")}</p>

  const set = (patch: Partial<Flow>) => setFlow({ ...flow, ...patch })
  const setDT = (patch: Partial<Flow["delivery_time"]>) => set({ delivery_time: { ...flow.delivery_time, ...patch } })
  const steps = byOrder(flow.steps)

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{tx("مراحل سبد و پرداخت", "Cart and checkout steps")}</CardTitle>
          <CardDescription>{tx("ترتیب، نام و روشن یا خاموش بودن هر مرحله", "Order, label and on/off for each step")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={flow.stepped} onCheckedChange={(v) => set({ stepped: v })} />
            {tx("پرداخت مرحله‌ای (خاموش: همه در یک صفحه)", "Stepped checkout (off: single page)")}
          </label>
          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
              <Switch
                checked={s.enabled}
                disabled={s.key === "address" || s.key === "payment"}
                onCheckedChange={(v) => set({ steps: steps.map((x) => (x.key === s.key ? { ...x, enabled: v } : x)) })}
              />
              <span className="w-24 text-xs text-muted-foreground">{fa ? STEP_FA[s.key] ?? s.key : s.key}</span>
              <Input className="max-w-xs" value={s.label} onChange={(e) => set({ steps: steps.map((x) => (x.key === s.key ? { ...x, label: e.target.value } : x)) })} />
              <button type="button" className="rounded border px-2 text-sm" onClick={() => set({ steps: move(steps, i, -1) })} aria-label="up">↑</button>
              <button type="button" className="rounded border px-2 text-sm" onClick={() => set({ steps: move(steps, i, 1) })} aria-label="down">↓</button>
            </div>
          ))}
        </CardContent>
      </Card>

      {steps.map((s) => {
        const fields = byOrder(flow.fields[s.key] ?? [])
        const setFields = (rows: Field[]) => set({ fields: { ...flow.fields, [s.key]: rows } })
        return (
          <Card key={`f-${s.key}`}>
            <CardHeader>
              <CardTitle>{tx("فیلدهای مرحله ", "Fields: ")}{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {fields.map((f, i) => (
                <div key={f.key} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
                  <label className="flex items-center gap-1 text-xs">
                    <Switch checked={f.enabled} onCheckedChange={(v) => setFields(fields.map((x) => (x.key === f.key ? { ...x, enabled: v } : x)))} />
                    {tx("فعال", "On")}
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <Switch checked={f.required} disabled={!f.enabled} onCheckedChange={(v) => setFields(fields.map((x) => (x.key === f.key ? { ...x, required: v } : x)))} />
                    {tx("اجباری", "Required")}
                  </label>
                  <Input className="max-w-xs" value={f.label} onChange={(e) => setFields(fields.map((x) => (x.key === f.key ? { ...x, label: e.target.value } : x)))} />
                  <code className="text-[11px] text-muted-foreground" dir="ltr">{f.key}</code>
                  <button type="button" className="rounded border px-2 text-sm" onClick={() => setFields(move(fields, i, -1))} aria-label="up">↑</button>
                  <button type="button" className="rounded border px-2 text-sm" onClick={() => setFields(move(fields, i, 1))} aria-label="down">↓</button>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader>
          <CardTitle>{tx("زمان ارسال", "Delivery time")}</CardTitle>
          <CardDescription>{tx("برای همه روش‌های ارسال یا فقط روش‌های انتخابی", "For all shipping methods or only selected ones")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <Label>{tx("دامنه", "Scope")}</Label>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={flow.delivery_time.mode} onChange={(e) => setDT({ mode: e.target.value === "methods" ? "methods" : "all" })}>
              <option value="all">{tx("همه روش‌های ارسال", "All shipping methods")}</option>
              <option value="methods">{tx("فقط روش‌های انتخابی", "Only selected methods")}</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label>{tx("شناسه روش‌ها (instance یا method، با ویرگول)", "Method ids (instance or method, comma separated)")}</Label>
            <Input dir="ltr" value={flow.delivery_time.shipping_methods.join(",")} onChange={(e) => setDT({ shipping_methods: e.target.value.split(/[,،\s]+/).filter(Boolean) })} />
          </div>
          <div className="grid gap-1">
            <Label>{tx("تعداد روزهای قابل انتخاب", "Days ahead")}</Label>
            <Input type="number" min={1} max={60} value={flow.delivery_time.days_ahead} onChange={(e) => setDT({ days_ahead: Number(e.target.value) || 1 })} />
          </div>
          <div className="grid gap-1">
            <Label>{tx("حداقل فاصله تا اولین روز", "Minimum lead days")}</Label>
            <Input type="number" min={0} max={30} value={flow.delivery_time.min_lead_days} onChange={(e) => setDT({ min_lead_days: Number(e.target.value) || 0 })} />
          </div>
          <div className="grid gap-1">
            <Label>{tx("ساعت پایان سفارش برای ارسال همان روز", "Same-day cutoff")}</Label>
            <Input dir="ltr" placeholder="14:00" value={flow.delivery_time.same_day_cutoff} onChange={(e) => setDT({ same_day_cutoff: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>{tx("روزهای تعطیل (تاریخ میلادی، با ویرگول)", "Closed dates (YYYY-MM-DD, comma separated)")}</Label>
            <Input dir="ltr" value={flow.delivery_time.closed_dates.join(",")} onChange={(e) => setDT({ closed_dates: e.target.value.split(/[,،\s]+/).filter(Boolean) })} />
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            {(fa ? WEEKDAYS_FA : WEEKDAYS_EN).map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={flow.delivery_time.closed_weekdays.includes(i)}
                  onChange={(e) => setDT({ closed_weekdays: e.target.checked ? [...flow.delivery_time.closed_weekdays, i] : flow.delivery_time.closed_weekdays.filter((x) => x !== i) })}
                />
                {tx("تعطیل: ", "Closed: ")}{d}
              </label>
            ))}
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>{tx("بازه‌های زمانی", "Time slots")}</Label>
            {flow.delivery_time.slots.map((sl, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Switch checked={sl.enabled} onCheckedChange={(v) => setDT({ slots: flow.delivery_time.slots.map((x, k) => (k === i ? { ...x, enabled: v } : x)) })} />
                <Input className="w-40" value={sl.label} onChange={(e) => setDT({ slots: flow.delivery_time.slots.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                <Input className="w-24" dir="ltr" value={sl.from} onChange={(e) => setDT({ slots: flow.delivery_time.slots.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)) })} />
                <Input className="w-24" dir="ltr" value={sl.to} onChange={(e) => setDT({ slots: flow.delivery_time.slots.map((x, k) => (k === i ? { ...x, to: e.target.value } : x)) })} />
                <button type="button" className="rounded border px-2 text-sm" onClick={() => setDT({ slots: flow.delivery_time.slots.filter((_, k) => k !== i) })}>×</button>
              </div>
            ))}
            <button
              type="button"
              className="w-fit rounded border px-3 py-1 text-sm"
              onClick={() => setDT({ slots: [...flow.delivery_time.slots, { id: `s${Date.now()}`, label: tx("بازه جدید", "New slot"), from: "09:00", to: "12:00", enabled: true }] })}
            >
              {tx("افزودن بازه", "Add slot")}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx("مرحله پرداخت", "Payment step")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <Label>{tx("نمایش درگاه‌ها", "Gateway layout")}</Label>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={flow.payment.gateway_layout} onChange={(e) => set({ payment: { ...flow.payment, gateway_layout: e.target.value } })}>
              <option value="list">{tx("فهرست جدا", "Separate list")}</option>
              <option value="grouped">{tx("گروه‌بندی بر اساس نوع", "Grouped by type")}</option>
              <option value="cards">{tx("کارت", "Cards")}</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label>{tx("نشانی قوانین خرید", "Terms URL")}</Label>
            <Input dir="ltr" value={flow.payment.terms_url} onChange={(e) => set({ payment: { ...flow.payment, terms_url: e.target.value } })} />
          </div>
          <div className="grid gap-1">
            <Label>{tx("ترتیب درگاه‌ها (شناسه‌ها با ویرگول)", "Gateway order (ids, comma separated)")}</Label>
            <Input dir="ltr" value={flow.payment.gateway_order.join(",")} onChange={(e) => set({ payment: { ...flow.payment, gateway_order: e.target.value.split(/[,،\s]+/).filter(Boolean) } })} />
          </div>
          <div className="grid gap-1">
            <Label>{tx("درگاه‌های پنهان در پرداخت", "Hidden gateways")}</Label>
            <Input dir="ltr" value={flow.payment.hidden_gateways.join(",")} onChange={(e) => set({ payment: { ...flow.payment, hidden_gateways: e.target.value.split(/[,،\s]+/).filter(Boolean) } })} />
          </div>
        </CardContent>
      </Card>

      <SettingsSaveBar onSave={() => void save()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
