"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { cn } from "@/lib/utils"
import { MarketplacePricingCard } from "@/views/settings/panels/marketplace/MarketplacePricingCard"
import { selectClass } from "@/views/settings/panels/marketplace/MarketplaceShared"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

export const PRICING_SETTINGS_BASE = "/dashboard/settings/shop/pricing"

const TABS = [
  "dashboard",
  "exchange",
  "retail",
  "credit",
  "installment",
  "wholesale",
  "marketplaces",
  "reference",
  "notifications",
  "style",
  "advanced",
] as const
type TabKey = (typeof TABS)[number]

const TAB_ALIASES: Record<string, TabKey> = { currency: "exchange", platform: "marketplaces", "search-engines": "marketplaces" }

type Section = Record<string, unknown>
type Settings = Record<string, Section> & { platforms?: Record<string, Section> }

type Meta = {
  gateways: { id: string; title_key: string; enabled: boolean }[]
  categories: { id: number; name: string }[]
  brands: { id: number; name: string }[]
  currency: string
}

type Stats = {
  total_products: number
  products_with_price: number
  products_locked: number
  exchange_rate: number
  exchange_rate_enabled: boolean
  last_api_update?: string | null
  purchase_types: string[]
  currency: string
}

type Calculated = {
  retail: number
  credit: number
  wholesale: number
  installment: number
  installment_months: number
  installments: { months: number; interest: number; monthly: number; total: number }[]
  channels: Record<string, number>
}

type RecalcState = {
  status: string
  dry_run?: boolean
  total?: number
  processed?: number
  updated?: number
  skipped?: number
  error?: string
  changes?: { id: number; variant: boolean; from: number; to: number }[]
}

const SETTINGS_KEY = ["pricing-settings"]

function usePricingSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<Settings>("/api/v1/pricing/settings") })
}

function usePricingMeta() {
  return useQuery({ queryKey: ["pricing-meta"], queryFn: () => api<Meta>("/api/v1/pricing/meta") })
}

function storageKey(section: string) {
  return section === "exchange" ? "general" : section
}

function useSection(section: string) {
  const qc = useQueryClient()
  const tCommon = useTranslations("common")
  const q = usePricingSettings()
  const [draft, setDraft] = useState<Section | null>(null)

  useEffect(() => {
    if (q.data) setDraft(structuredClone(q.data[storageKey(section)] ?? {}))
  }, [q.data, section])

  const save = useMutation({
    mutationFn: (data: Section) =>
      api<{ settings: Settings }>(`/api/v1/pricing/settings/${section}`, { method: "PUT", json: { data } }),
    onSuccess: (res) => {
      qc.setQueryData(SETTINGS_KEY, res.settings)
      void qc.invalidateQueries({ queryKey: ["pricing-stats"] })
      toast.success(tCommon("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const set = (key: string, value: unknown) => setDraft((d) => (d ? { ...d, [key]: value } : d))

  return { draft, set, setDraft, save: () => draft && save.mutate(draft), pending: save.isPending, loading: q.isLoading }
}

function formatNum(n: number | undefined | null, locale: string) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—"
  return formatNumber(Math.round(n), normalizeUiLocale(locale))
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid max-w-md gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  )
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex max-w-lg items-start justify-between gap-3">
      <div>
        <Label>{label}</Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function NumInput({ value, onChange, min, step }: { value: unknown; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <Input
      type="number"
      dir="ltr"
      min={min}
      step={step ?? "any"}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function SectionCard({
  title,
  description,
  children,
  onSave,
  pending,
}: {
  title: string
  description?: string
  children: ReactNode
  onSave?: () => void
  pending?: boolean
}) {
  const tCommon = useTranslations("common")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {onSave ? (
          <Button disabled={pending} onClick={onSave}>
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RoundingFields({ draft, set }: { draft: Section; set: (k: string, v: unknown) => void }) {
  const t = useTranslations("pricing_settings")
  return (
    <>
      <SwitchRow label={t("round_enabled")} checked={draft.round_enabled !== false} onChange={(v) => set("round_enabled", v)} />
      {draft.round_enabled !== false ? (
        <Field label={t("round_to")} hint={t("round_to_hint")}>
          <NumInput value={draft.round_to ?? 1000} min={1} onChange={(v) => set("round_to", Math.max(1, v || 1))} />
        </Field>
      ) : null}
    </>
  )
}

function GatewayPicker({ value, onChange }: { value: unknown; onChange: (ids: string[]) => void }) {
  const t = useTranslations("pricing_settings")
  const tPay = useTranslations("payments_hub")
  const meta = usePricingMeta()
  const selected = Array.isArray(value) ? (value as string[]) : []
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((x) => x !== id))

  return (
    <div className="space-y-2">
      <Label>{t("gateways")}</Label>
      <p className="text-muted-foreground text-xs">{t("gateways_hint")}</p>
      <div className="flex flex-wrap gap-3">
        {(meta.data?.gateways ?? []).map((g) => (
          <label key={g.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <Checkbox checked={selected.includes(g.id)} onCheckedChange={(v) => toggle(g.id, v === true)} />
            <span>{tPay(g.title_key)}</span>
            {!g.enabled ? <Badge variant="outline">{t("gateway_disabled")}</Badge> : null}
          </label>
        ))}
      </div>
    </div>
  )
}

function TextsFields({ draft, set }: { draft: Section; set: (k: string, v: unknown) => void }) {
  const t = useTranslations("pricing_settings")
  const texts = (draft.texts as Record<string, string> | undefined) ?? {}
  const patch = (k: string, v: string) => set("texts", { ...texts, [k]: v })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("texts_title")}>
        <Input value={texts.title ?? ""} onChange={(e) => patch("title", e.target.value)} />
      </Field>
      <Field label={t("texts_button")}>
        <Input value={texts.button_text ?? ""} onChange={(e) => patch("button_text", e.target.value)} />
      </Field>
    </div>
  )
}

function PricingCalculatorCard() {
  const t = useTranslations("pricing_settings")
  const locale = useLocale()
  const [purchase, setPurchase] = useState("")
  const calc = useMutation({
    mutationFn: (value: number) =>
      api<Calculated>("/api/v1/pricing/calculate", { method: "POST", json: { purchase_price_minor: value } }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const r = calc.data

  return (
    <SectionCard title={t("calculator.title")} description={t("calculator.hint")}>
      <div className="flex max-w-md items-end gap-2">
        <Field label={t("calculator.purchase")}>
          <Input dir="ltr" type="number" value={purchase} onChange={(e) => setPurchase(e.target.value)} />
        </Field>
        <Button disabled={!purchase || calc.isPending} onClick={() => calc.mutate(Number(purchase))}>
          {t("calculator.run")}
        </Button>
      </div>
      {r ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>{t("types.cash")}</TableCell>
                <TableCell className="font-semibold">{formatNum(r.retail, locale)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t("types.credit")}</TableCell>
                <TableCell>{formatNum(r.credit, locale)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{t("types.wholesale")}</TableCell>
                <TableCell>{formatNum(r.wholesale, locale)}</TableCell>
              </TableRow>
              {r.installments.map((row) => (
                <TableRow key={row.months}>
                  <TableCell>{t("calculator.installment_row", { months: formatNum(row.months, locale), interest: toLocaleDigits(row.interest, locale) })}</TableCell>
                  <TableCell>
                    {formatNum(row.monthly, locale)} × {formatNum(row.months, locale)} = {formatNum(row.total, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("calculator.channel")}</TableHead>
                <TableHead>{t("calculator.price")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(r.channels).map(([slug, price]) => (
                <TableRow key={slug}>
                  <TableCell>{slug}</TableCell>
                  <TableCell>{formatNum(price, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </SectionCard>
  )
}

function DashboardTab() {
  const t = useTranslations("pricing_settings")
  const locale = useLocale()
  const stats = useQuery({ queryKey: ["pricing-stats"], queryFn: () => api<Stats>("/api/v1/pricing/stats") })
  const s = stats.data
  const items = s
    ? [
        { label: t("stats.total"), value: formatNum(s.total_products, locale) },
        { label: t("stats.with_price"), value: formatNum(s.products_with_price, locale) },
        { label: t("stats.locked"), value: formatNum(s.products_locked, locale) },
        {
          label: t("stats.exchange_rate"),
          value: s.exchange_rate_enabled ? formatNum(s.exchange_rate, locale) : t("stats.fx_off"),
        },
      ]
    : []

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <Card key={it.label}>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-xs">{it.label}</p>
              <p className="text-xl font-semibold">{it.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {s ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("stats.purchase_types")}:</span>
          {s.purchase_types.map((pt) => (
            <Badge key={pt} variant="secondary">
              {t(`types.${pt}`)}
            </Badge>
          ))}
        </div>
      ) : null}
      <GeneralCard />
      <PricingCalculatorCard />
    </div>
  )
}

function GeneralCard() {
  const t = useTranslations("pricing_settings")
  const { draft, set, save, pending } = useSection("general")
  const settings = usePricingSettings().data
  if (!draft) return null
  const enabledTypes = ["cash", ...(["credit", "installment"] as const).filter((k) => settings?.[k]?.enabled)]

  return (
    <SectionCard title={t("general.title")} onSave={save} pending={pending}>
      <SwitchRow label={t("general.enabled")} hint={t("general.enabled_hint")} checked={draft.enabled !== false} onChange={(v) => set("enabled", v)} />
      <Field label={t("general.default_type")} hint={t("general.default_type_hint")}>
        <select className={selectClass} value={String(draft.default_purchase_type ?? "cash")} onChange={(e) => set("default_purchase_type", e.target.value)}>
          {enabledTypes.map((k) => (
            <option key={k} value={k}>
              {t(`types.${k}`)}
            </option>
          ))}
        </select>
      </Field>
    </SectionCard>
  )
}

function ExchangeTab() {
  const t = useTranslations("pricing_settings")
  const qc = useQueryClient()
  const { draft, set, save, pending } = useSection("exchange")
  const test = useMutation({
    mutationFn: () =>
      api<{ price: number }>("/api/v1/pricing/exchange/test", {
        method: "POST",
        json: { api_key: draft?.api_key, api_symbol: draft?.api_symbol },
      }),
    onSuccess: (r) => toast.success(t("exchange.test_ok", { price: r.price })),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const fetchRate = useMutation({
    mutationFn: () => api<{ price: number }>("/api/v1/pricing/exchange/fetch", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(t("exchange.fetch_ok", { price: r.price }))
      void qc.invalidateQueries({ queryKey: SETTINGS_KEY })
      void qc.invalidateQueries({ queryKey: ["pricing-stats"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  if (!draft) return null

  return (
    <div className="space-y-4">
      <SectionCard title={t("exchange.title")} description={t("exchange.hint")} onSave={save} pending={pending}>
        <SwitchRow label={t("exchange.enabled")} hint={t("exchange.enabled_hint")} checked={Boolean(draft.exchange_rate_enabled)} onChange={(v) => set("exchange_rate_enabled", v)} />
        <Field label={t("exchange.purchase_currency")}>
          <select className={selectClass} value={String(draft.purchase_currency ?? "display")} onChange={(e) => set("purchase_currency", e.target.value)}>
            <option value="base">{t("exchange.currency_base")}</option>
            <option value="display">{t("exchange.currency_display")}</option>
          </select>
        </Field>
        <Field label={t("exchange.rate")} hint={draft.last_api_update ? t("exchange.last_update", { at: String(draft.last_api_update) }) : undefined}>
          <NumInput value={draft.exchange_rate} min={0} onChange={(v) => set("exchange_rate", v)} />
        </Field>
      </SectionCard>
      <SectionCard title={t("exchange.api_title")} description={t("exchange.api_hint")} onSave={save} pending={pending}>
        <SwitchRow label={t("exchange.api_enabled")} checked={Boolean(draft.api_enabled)} onChange={(v) => set("api_enabled", v)} />
        <Field label={t("exchange.api_key")}>
          <Input dir="ltr" type="password" value={String(draft.api_key ?? "")} onChange={(e) => set("api_key", e.target.value)} />
        </Field>
        <Field label={t("exchange.api_symbol")}>
          <Input dir="ltr" value={String(draft.api_symbol ?? "USD")} onChange={(e) => set("api_symbol", e.target.value.toUpperCase())} />
        </Field>
        <SwitchRow label={t("exchange.auto_update")} checked={Boolean(draft.auto_update_enabled)} onChange={(v) => set("auto_update_enabled", v)} />
        {draft.auto_update_enabled ? (
          <Field label={t("exchange.auto_hour")}>
            <NumInput value={draft.auto_update_hour ?? 0} min={0} step={1} onChange={(v) => set("auto_update_hour", Math.min(23, Math.max(0, Math.round(v))))} />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!draft.api_key || test.isPending} onClick={() => test.mutate()}>
            {t("exchange.test")}
          </Button>
          <Button variant="outline" disabled={!draft.api_enabled || fetchRate.isPending} onClick={() => fetchRate.mutate()}>
            {t("exchange.fetch")}
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

function RetailTab() {
  const t = useTranslations("pricing_settings")
  const { draft, set, save, pending } = useSection("retail")
  if (!draft) return null
  return (
    <SectionCard title={t("retail.title")} description={t("retail.hint")} onSave={save} pending={pending}>
      <Field label={t("retail.profit")}>
        <NumInput value={draft.profit_percent} onChange={(v) => set("profit_percent", v)} />
      </Field>
      <RoundingFields draft={draft} set={set} />
      <GatewayPicker value={draft.gateways} onChange={(v) => set("gateways", v)} />
    </SectionCard>
  )
}

function CreditTab() {
  const t = useTranslations("pricing_settings")
  const { draft, set, save, pending } = useSection("credit")
  if (!draft) return null
  return (
    <SectionCard title={t("credit.title")} description={t("credit.hint")} onSave={save} pending={pending}>
      <SwitchRow label={t("credit.enabled")} checked={Boolean(draft.enabled)} onChange={(v) => set("enabled", v)} />
      <Field label={t("credit.increase")}>
        <NumInput value={draft.increase_percent} onChange={(v) => set("increase_percent", v)} />
      </Field>
      <GatewayPicker value={draft.gateways} onChange={(v) => set("gateways", v)} />
      <TextsFields draft={draft} set={set} />
    </SectionCard>
  )
}

function InstallmentTab() {
  const t = useTranslations("pricing_settings")
  const { draft, set, save, pending } = useSection("installment")
  if (!draft) return null
  const plans = (Array.isArray(draft.plans) ? draft.plans : []) as { months: number; interest: number }[]
  const setPlan = (i: number, key: "months" | "interest", v: number) =>
    set("plans", plans.map((p, idx) => (idx === i ? { ...p, [key]: v } : p)))

  return (
    <SectionCard title={t("installment.title")} description={t("installment.hint")} onSave={save} pending={pending}>
      <SwitchRow label={t("installment.enabled")} checked={Boolean(draft.enabled)} onChange={(v) => set("enabled", v)} />
      <div className="space-y-2">
        <Label>{t("installment.plans")}</Label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("installment.months")}</TableHead>
              <TableHead>{t("installment.interest")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((p, i) => (
              <TableRow key={i}>
                <TableCell>
                  <NumInput value={p.months} min={1} step={1} onChange={(v) => setPlan(i, "months", Math.round(v))} />
                </TableCell>
                <TableCell>
                  <NumInput value={p.interest} min={0} onChange={(v) => setPlan(i, "interest", v)} />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => set("plans", plans.filter((_, idx) => idx !== i))}>
                    {t("remove")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button size="sm" variant="outline" onClick={() => set("plans", [...plans, { months: 12, interest: 20 }])}>
          {t("installment.add_plan")}
        </Button>
      </div>
      <RoundingFields draft={draft} set={set} />
      <Field label={t("installment.theme")}>
        <select className={selectClass} value={String(draft.pdp_theme ?? "classic")} onChange={(e) => set("pdp_theme", e.target.value)}>
          <option value="classic">{t("installment.theme_classic")}</option>
          <option value="timeline">{t("installment.theme_timeline")}</option>
        </select>
      </Field>
      <GatewayPicker value={draft.gateways} onChange={(v) => set("gateways", v)} />
      <TextsFields draft={draft} set={set} />
    </SectionCard>
  )
}

function WholesaleTab() {
  const t = useTranslations("pricing_settings")
  const meta = usePricingMeta()
  const { draft, set, save, pending } = useSection("wholesale")
  const [newCat, setNewCat] = useState("")
  if (!draft) return null
  const rules = (draft.category_rules && typeof draft.category_rules === "object" ? draft.category_rules : {}) as Record<string, number>
  const defaults = (draft.defaults as Record<string, number> | undefined) ?? {}
  const catName = (id: string) => meta.data?.categories.find((c) => String(c.id) === id)?.name ?? `#${id}`

  return (
    <SectionCard title={t("wholesale.title")} description={t("wholesale.hint")} onSave={save} pending={pending}>
      <SwitchRow label={t("wholesale.enabled")} checked={Boolean(draft.enabled)} onChange={(v) => set("enabled", v)} />
      <Field label={t("wholesale.discount")} hint={t("wholesale.discount_hint")}>
        <NumInput value={draft.discount_percent} min={0} onChange={(v) => set("discount_percent", v)} />
      </Field>
      <div className="space-y-2">
        <Label>{t("wholesale.category_rules")}</Label>
        <p className="text-muted-foreground text-xs">{t("wholesale.category_rules_hint")}</p>
        {Object.keys(rules).length ? (
          <Table>
            <TableBody>
              {Object.entries(rules).map(([id, pct]) => (
                <TableRow key={id}>
                  <TableCell>{catName(id)}</TableCell>
                  <TableCell className="w-32">
                    <NumInput value={pct} min={0} onChange={(v) => set("category_rules", { ...rules, [id]: v })} />
                  </TableCell>
                  <TableCell className="w-20">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const next = { ...rules }
                        delete next[id]
                        set("category_rules", next)
                      }}
                    >
                      {t("remove")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        <div className="flex max-w-md gap-2">
          <select className={selectClass} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            <option value="">{t("wholesale.pick_category")}</option>
            {(meta.data?.categories ?? [])
              .filter((c) => !(String(c.id) in rules))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <Button
            variant="outline"
            disabled={!newCat}
            onClick={() => {
              set("category_rules", { ...rules, [newCat]: Number(draft.discount_percent ?? 0) })
              setNewCat("")
            }}
          >
            {t("add")}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["min_qty", "min_weight", "qty_step", "min_distinct_skus"] as const).map((k) => (
          <Field key={k} label={t(`wholesale.${k}`)}>
            <NumInput value={defaults[k] ?? 0} min={0} onChange={(v) => set("defaults", { ...defaults, [k]: v })} />
          </Field>
        ))}
      </div>
      <SwitchRow label={t("wholesale.partner_enabled")} checked={Boolean(draft.partner_enabled)} onChange={(v) => set("partner_enabled", v)} />
      <SwitchRow label={t("wholesale.partner_only")} checked={Boolean(draft.partner_only)} onChange={(v) => set("partner_only", v)} />
      <SwitchRow label={t("wholesale.hide_retail")} checked={Boolean(draft.hide_retail_from_partner)} onChange={(v) => set("hide_retail_from_partner", v)} />
      <GatewayPicker value={draft.gateways} onChange={(v) => set("gateways", v)} />
    </SectionCard>
  )
}

function ReferenceTab() {
  const t = useTranslations("pricing_settings")
  const { draft, set, save, pending } = useSection("reference")
  if (!draft) return null
  const sources = (draft.sources as Record<string, boolean> | undefined) ?? {}
  return (
    <SectionCard title={t("reference.title")} description={t("reference.hint")} onSave={save} pending={pending}>
      <SwitchRow label={t("reference.enabled")} checked={Boolean(draft.enabled)} onChange={(v) => set("enabled", v)} />
      <div className="flex flex-wrap gap-3">
        {(["digikala", "technolife", "basalam", "woocommerce"] as const).map((s) => (
          <label key={s} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
            <Checkbox checked={sources[s] !== false} onCheckedChange={(v) => set("sources", { ...sources, [s]: v === true })} />
            {t(`reference.source_${s}`)}
          </label>
        ))}
      </div>
      <SwitchRow label={t("reference.sync_stock")} checked={draft.sync_stock !== false} onChange={(v) => set("sync_stock", v)} />
      <SwitchRow label={t("reference.sync_stock_locked")} checked={Boolean(draft.sync_stock_when_locked)} onChange={(v) => set("sync_stock_when_locked", v)} />
      <p className="text-muted-foreground text-xs">{t("reference.usage")}</p>
    </SectionCard>
  )
}

function NotificationsTab() {
  const t = useTranslations("pricing_settings")
  const { draft, set, save, pending } = useSection("notifications")
  if (!draft) return null
  const text = (k: string) => (
    <Field key={k} label={t(`notifications.${k}`)}>
      <Input value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
    </Field>
  )
  const area = (k: string) => (
    <Field key={k} label={t(`notifications.${k}`)}>
      <Textarea rows={2} value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
    </Field>
  )
  const sw = (k: string) => (
    <SwitchRow key={k} label={t(`notifications.${k}`)} checked={Boolean(draft[k])} onChange={(v) => set(k, v)} />
  )
  return (
    <SectionCard title={t("notifications.title")} onSave={save} pending={pending}>
      <div className="grid gap-4 sm:grid-cols-2">
        {["credit_text", "installment_text", "custom_cash_label", "custom_install_label", "guaranty_text"].map(text)}
      </div>
      {["show_cash_badge", "show_credit_badge", "show_install_badge", "show_guaranty_label"].map(sw)}
      {["cash_description", "credit_description", "installment_description", "wholesale_description"].map(area)}
      {sw("alert_product_enabled")}
      {area("alert_product_text")}
      {sw("alert_cart_enabled")}
      {area("alert_cart_text")}
      {sw("alert_checkout_enabled")}
      {area("alert_checkout_text")}
    </SectionCard>
  )
}

function StyleTab() {
  const t = useTranslations("pricing_settings")
  const { draft, set, save, pending } = useSection("style")
  if (!draft) return null
  return (
    <SectionCard title={t("style.title")} description={t("style.hint")} onSave={save} pending={pending}>
      <SwitchRow label={t("style.show_purchase_types")} checked={draft.show_purchase_types !== false} onChange={(v) => set("show_purchase_types", v)} />
      <SwitchRow label={t("style.show_installment_table")} checked={draft.show_installment_table !== false} onChange={(v) => set("show_installment_table", v)} />
      <Field label={t("style.placement")}>
        <select className={selectClass} value={String(draft.placement ?? "before_cart")} onChange={(e) => set("placement", e.target.value)}>
          {["summary", "before_cart", "after_cart", "before_tabs", "after_tabs", "none"].map((p) => (
            <option key={p} value={p}>
              {t(`style.placement_${p}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("style.price_color")}>
        <Input type="color" className="h-9 w-20 p-1" value={String(draft.price_color ?? "#16a34a")} onChange={(e) => set("price_color", e.target.value)} />
      </Field>
      <Field label={t("style.border_radius")}>
        <NumInput value={draft.border_radius ?? 12} min={0} step={1} onChange={(v) => set("border_radius", Math.round(v))} />
      </Field>
    </SectionCard>
  )
}

function AdvancedTab() {
  const t = useTranslations("pricing_settings")
  const locale = useLocale()
  const qc = useQueryClient()
  const [json, setJson] = useState("")
  const [polling, setPolling] = useState(false)

  const state = useQuery({
    queryKey: ["pricing-recalc"],
    queryFn: () => api<RecalcState>("/api/v1/pricing/recalculate/state"),
    refetchInterval: polling ? 2000 : false,
  })
  useEffect(() => {
    const s = state.data?.status
    if (polling && s && !["queued", "running"].includes(s)) setPolling(false)
  }, [state.data?.status, polling])

  const start = useMutation({
    mutationFn: (dry: boolean) => api<RecalcState>("/api/v1/pricing/recalculate", { method: "POST", json: { dry_run: dry } }),
    onSuccess: (s) => {
      qc.setQueryData(["pricing-recalc"], s)
      setPolling(true)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const exportQ = useMutation({
    mutationFn: () => api<{ json: string }>("/api/v1/pricing/settings/export"),
    onSuccess: (r) => {
      setJson(r.json)
      const blob = new Blob([r.json], { type: "application/json" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = "pricing-settings.json"
      a.click()
      URL.revokeObjectURL(a.href)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const importQ = useMutation({
    mutationFn: () => api<Settings>("/api/v1/pricing/settings/import", { method: "POST", json: { json } }),
    onSuccess: (s) => {
      qc.setQueryData(SETTINGS_KEY, s)
      toast.success(t("advanced.imported"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const s = state.data
  const running = s && ["queued", "running"].includes(s.status)

  return (
    <div className="space-y-4">
      <SectionCard title={t("advanced.recalc_title")} description={t("advanced.recalc_hint")}>
        <div className="flex flex-wrap gap-2">
          <Button disabled={start.isPending || Boolean(running)} onClick={() => start.mutate(false)}>
            {t("advanced.recalc_run")}
          </Button>
          <Button variant="outline" disabled={start.isPending || Boolean(running)} onClick={() => start.mutate(true)}>
            {t("advanced.recalc_dry")}
          </Button>
        </div>
        {s && s.status !== "idle" ? (
          <div className="space-y-2 text-sm">
            <p>
              {t(`advanced.status_${s.status}`)}
              {s.dry_run ? ` (${t("advanced.dry")})` : ""} — {t("advanced.progress", {
                processed: s.processed ?? 0,
                total: s.total ?? 0,
                updated: s.updated ?? 0,
                skipped: s.skipped ?? 0,
              })}
            </p>
            {s.error ? <p className="text-destructive">{s.error}</p> : null}
            {s.changes?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("advanced.from")}</TableHead>
                    <TableHead>{t("advanced.to")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.changes.map((c) => (
                    <TableRow key={`${c.variant ? "v" : "p"}${c.id}`}>
                      <TableCell>
                        {c.variant ? t("advanced.variant") : ""} {c.id}
                      </TableCell>
                      <TableCell>{formatNum(c.from, locale)}</TableCell>
                      <TableCell>{formatNum(c.to, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
      <SectionCard title={t("advanced.io_title")} description={t("advanced.io_hint")}>
        <Textarea rows={8} dir="ltr" className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={exportQ.isPending} onClick={() => exportQ.mutate()}>
            {t("advanced.export")}
          </Button>
          <Button disabled={!json.trim() || importQ.isPending} onClick={() => importQ.mutate()}>
            {t("advanced.import")}
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

export function PricingSettingsPanel({ tab }: { tab?: string }) {
  const t = useTranslations("pricing_settings")
  const active: TabKey = useMemo(() => {
    const key = tab ? (TAB_ALIASES[tab] ?? tab) : "dashboard"
    return (TABS as readonly string[]).includes(key) ? (key as TabKey) : "dashboard"
  }, [tab])
  const q = usePricingSettings()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="pricing-tabs">
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === "dashboard" ? PRICING_SETTINGS_BASE : `${PRICING_SETTINGS_BASE}/${key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              key === active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground",
            )}
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </nav>
      {q.error ? <p className="text-destructive text-sm">{getApiErrorMessage(q.error)}</p> : null}
      {active === "dashboard" ? <DashboardTab /> : null}
      {active === "exchange" ? <ExchangeTab /> : null}
      {active === "retail" ? <RetailTab /> : null}
      {active === "credit" ? <CreditTab /> : null}
      {active === "installment" ? <InstallmentTab /> : null}
      {active === "wholesale" ? <WholesaleTab /> : null}
      {active === "marketplaces" ? <MarketplacePricingCard /> : null}
      {active === "reference" ? <ReferenceTab /> : null}
      {active === "notifications" ? <NotificationsTab /> : null}
      {active === "style" ? <StyleTab /> : null}
      {active === "advanced" ? <AdvancedTab /> : null}
    </div>
  )
}
