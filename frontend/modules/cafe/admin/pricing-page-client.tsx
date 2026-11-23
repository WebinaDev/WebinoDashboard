"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Calculator, Check, Coins, Percent, Receipt, Sparkles, Trash2, TrendingUp, Users } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api, type ApiListPayload } from "@/lib/api"
import { asArray } from "@/lib/list-utils"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"
import { MoneyText, formatMoneyText } from "@/components/currency/MoneyDisplay"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"
import {
  DEFAULT_RATES,
  allocateOverhead,
  calculatePrice,
  foodCostVerdict,
  priceForFoodCostTarget,
  reversePrice,
  type PricingInput,
  type PricingRates,
  type PricingResult,
} from "./pricing-math"

type Product = {
  id: number
  name: string
  price_minor: number
  currency?: string | null
}

type PriceSheet = {
  id: number
  product_id: number | null
  name: string | null
  ingredient_cost_minor: number
  packaging_cost_minor: number
  labour_cost_minor: number
  fixed_cost_minor: number
  waste_percent: number
  target_profit_percent: number
  platform_commission_percent: number
  vat_percent: number
  suggested_dine_in_minor: number | null
  suggested_delivery_minor: number | null
  applied_price_minor: number | null
  updated_at?: string | null
  product?: Product | null
}

type PricingResponse = {
  settings: PricingRates & Record<string, unknown>
  currency: string
  sheets: PriceSheet[]
}

/** Defaults for a brand-new sheet, in the shape the form edits. */
function blankForm(rates: PricingRates) {
  return {
    product_id: "" as string | number,
    name: "",
    ingredient_cost: "" as string | number,
    packaging_cost: rates.default_packaging_minor || ("" as string | number),
    labour_cost: "" as string | number,
    fixed_cost: "" as string | number,
    waste_percent: rates.waste_percent,
    target_profit_percent: rates.target_profit_percent,
    platform_commission_percent: rates.platform_commission_percent,
    vat_percent: rates.vat_percent,
  }
}

type FormState = ReturnType<typeof blankForm>

const num = (value: string | number | undefined, fallback = 0) => {
  if (value === "" || value === undefined || value === null) return fallback
  const parsed = Number(String(value).replace(/[٫,٬\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))))
  return Number.isFinite(parsed) ? parsed : fallback
}

export default function PricingPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.pricing")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState | null>(null)
  const [channelTab, setChannelTab] = useState<"dine_in" | "delivery">("dine_in")

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-pricing"],
    queryFn: () => api<PricingResponse>("/api/v1/cafe/pricing"),
  })

  const rates: PricingRates = useMemo(
    () => ({ ...DEFAULT_RATES, ...(data?.settings ?? {}) }) as PricingRates,
    [data?.settings],
  )
  const values = form ?? blankForm(rates)
  const currency = data?.currency ?? "IRT"

  // List endpoints answer the `{data, meta}` envelope, so unwrap before the picker maps it.
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () =>
      asArray<Product>(await api<ApiListPayload<Product[]>>("/api/v1/products")),
  })

  // Everything below is computed locally so a keystroke never waits for the network; the
  // save action still posts the numbers and the server recomputes them authoritatively.
  const input: PricingInput = useMemo(
    () => ({
      ingredient_cost: num(values.ingredient_cost),
      packaging_cost: num(values.packaging_cost),
      labour_cost: num(values.labour_cost),
      fixed_cost: num(values.fixed_cost),
      waste_percent: num(values.waste_percent, rates.waste_percent),
      target_profit_percent: num(values.target_profit_percent, rates.target_profit_percent),
      platform_commission_percent: num(values.platform_commission_percent, rates.platform_commission_percent),
      vat_percent: num(values.vat_percent, rates.vat_percent),
      is_delivery: false,
    }),
    [values, rates],
  )

  const dineIn = useMemo(() => calculatePrice(input, rates), [input, rates])
  const delivery = useMemo(() => calculatePrice({ ...input, is_delivery: true }, rates), [input, rates])

  const money = (value: number) => <MoneyText amount={value} currency={currency} />
  // Persian UI uses the Persian decimal separator (٫), so 19.9 reads as ۱۹٫۹.
  const pct = (value: number) =>
    `${toLocaleDigits(value.toFixed(1).replace(/\.0$/, "").replace(".", locale === "fa" ? "٫" : "."), locale)}٪`

  const save = useMutation({
    mutationFn: (applyTo: "none" | "dine_in" | "delivery") =>
      api("/api/v1/cafe/pricing", {
        method: "POST",
        json: {
          product_id: values.product_id === "" ? null : Number(values.product_id),
          name: values.name || null,
          ingredient_cost: input.ingredient_cost,
          packaging_cost: input.packaging_cost,
          labour_cost: input.labour_cost,
          fixed_cost: input.fixed_cost,
          waste_percent: input.waste_percent,
          target_profit_percent: input.target_profit_percent,
          platform_commission_percent: input.platform_commission_percent,
          vat_percent: input.vat_percent,
          apply_price: applyTo !== "none",
          apply_to: applyTo === "none" ? undefined : applyTo,
        },
      }),
    onSuccess: async (_res, applyTo) => {
      toast.success(applyTo === "none" ? t("saved") : t("applied"))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cafe-pricing"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ])
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/pricing/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-pricing"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  // Percent inputs are controlled as text so a half-typed "7." is not destroyed mid-keystroke.
  function setPercent(key: "waste_percent" | "target_profit_percent" | "platform_commission_percent" | "vat_percent", value: string) {
    setForm((current) => ({ ...(current ?? values), [key]: value }) as FormState)
  }

  function editSheet(sheet: PriceSheet) {
    setForm({
      product_id: sheet.product_id ?? "",
      name: sheet.name ?? "",
      ingredient_cost: sheet.ingredient_cost_minor,
      packaging_cost: sheet.packaging_cost_minor,
      labour_cost: sheet.labour_cost_minor,
      fixed_cost: sheet.fixed_cost_minor,
      waste_percent: sheet.waste_percent,
      target_profit_percent: sheet.target_profit_percent,
      platform_commission_percent: sheet.platform_commission_percent,
      vat_percent: sheet.vat_percent,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <TooltipProvider delayDuration={200}>
      <CafeAdminShell
        title={t("title")}
        description={t("description")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setForm(blankForm(rates))} disabled={save.isPending}>
            {t("reset")}
          </Button>
          <Button
            onClick={() => save.mutate(values.product_id === "" ? "none" : "dine_in")}
            disabled={save.isPending || num(values.ingredient_cost) <= 0}
          >
            {values.product_id === "" ? t("save_sheet") : t("save_and_apply")}
          </Button>
        </div>
      }
    >
      {confirmDialog}

      {isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* ---------- inputs ---------- */}
        <div className="space-y-5">
          <CafeSection title={t("inputs_heading")} description={t("inputs_hint")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("product")}</Label>
                <select
                  className={cafeSelectClass}
                  value={values.product_id}
                  onChange={(e) => setForm({ ...values, product_id: e.target.value })}
                >
                  <option value="">{t("product_none")}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — {money(product.price_minor)}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">{t("product_hint")}</p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("name")}</Label>
                <Input
                  value={values.name}
                  placeholder={t("name_placeholder")}
                  onChange={(e) => setForm({ ...values, name: e.target.value })}
                />
              </div>

              <MoneyField
                label={t("ingredient_cost")}
                hint={t("ingredient_hint")}
                value={values.ingredient_cost}
                onChange={(v) => setForm({ ...values, ingredient_cost: v })}
                suffix={t("currency_toman")}
              />
              <MoneyField
                label={t("packaging_cost")}
                hint={t("packaging_hint")}
                value={values.packaging_cost}
                onChange={(v) => setForm({ ...values, packaging_cost: v })}
                suffix={t("currency_toman")}
              />
            </div>

            <OverheadAllocator
              onAllocate={(labour, fixed) => setForm({ ...values, labour_cost: labour, fixed_cost: fixed })}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <MoneyField
                label={t("labour_cost")}
                hint={t("labour_hint")}
                value={values.labour_cost}
                onChange={(v) => setForm({ ...values, labour_cost: v })}
                suffix={t("currency_toman")}
                optional
              />
              <MoneyField
                label={t("fixed_cost")}
                hint={t("fixed_hint")}
                value={values.fixed_cost}
                onChange={(v) => setForm({ ...values, fixed_cost: v })}
                suffix={t("currency_toman")}
                optional
              />
            </div>
          </CafeSection>

          <CafeSection title={t("rates_heading")} description={t("rates_hint")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <PercentField
                label={t("waste_percent")}
                hint={t("waste_hint")}
                value={values.waste_percent}
                onChange={(v) => setPercent("waste_percent", v)}
              />
              <PercentField
                label={t("target_profit_percent")}
                hint={t("profit_hint")}
                value={values.target_profit_percent}
                onChange={(v) => setPercent("target_profit_percent", v)}
              />
              <PercentField
                label={t("platform_commission_percent")}
                hint={t("commission_hint")}
                value={values.platform_commission_percent}
                onChange={(v) => setPercent("platform_commission_percent", v)}
              />
              <PercentField
                label={t("vat_percent")}
                hint={t("vat_hint")}
                value={values.vat_percent}
                onChange={(v) => setPercent("vat_percent", v)}
              />
            </div>
            {dineIn.clamped || delivery.clamped ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {t("clamped_warning")}
              </p>
            ) : null}
          </CafeSection>

          <ReversePanel rates={rates} input={input} money={money} />

          {values.product_id !== "" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => save.mutate("delivery")}
                disabled={save.isPending || num(values.ingredient_cost) <= 0}
              >
                {t("apply_delivery_price")}
              </Button>
            </div>
          ) : null}
        </div>

        {/* ---------- results ---------- */}
        <div className="space-y-5">
          <div className="sticky top-4 space-y-4">
            <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-4">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Sparkles className="size-3.5" />
                {t("suggested_dine_in")}
              </p>
              <p className="mt-1 text-3xl font-black tracking-tight">{money(dineIn.prices.final)}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("pre_vat_note", { amount: formatMoneyText(dineIn.prices.beforeVat, locale, currency) })}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Stat label={t("full_cost")} value={money(dineIn.costs.full)} />
                <Stat label={t("net_profit")} value={money(dineIn.prices.net)} tone={dineIn.prices.net >= 0 ? "good" : "bad"} />
                <Stat label={t("food_cost")} value={pct(dineIn.ratios.foodCostPercent)} tone={foodCostVerdict(dineIn.ratios.foodCostPercent)} />
                <Stat label={t("net_margin")} value={pct(dineIn.ratios.netMarginPercent)} />
              </div>
            </div>

            <Tabs
              value={channelTab}
              onValueChange={(value) => setChannelTab(value === "delivery" ? "delivery" : "dine_in")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="dine_in">{t("channel_dine_in")}</TabsTrigger>
                <TabsTrigger value="delivery">{t("channel_delivery")}</TabsTrigger>
              </TabsList>
              <TabsContent value="dine_in">
                <Breakdown result={dineIn} money={money} pct={pct} />
              </TabsContent>
              <TabsContent value="delivery">
                <Breakdown result={delivery} money={money} pct={pct} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <CafeSection title={t("sheets_heading")} description={t("sheets_hint")}>
        {(data?.sheets ?? []).length === 0 ? (
          <CafeEmptyState message={t("sheets_empty")} />
        ) : (
          <ul className="space-y-2">
            {(data?.sheets ?? []).map((sheet) => (
              <li key={sheet.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-semibold">{sheet.name || sheet.product?.name || `#${sheet.id}`}</p>
                  <p className="text-muted-foreground text-xs">
                    {money(sheet.ingredient_cost_minor)} + {money(sheet.packaging_cost_minor)} ·{" "}
                    {t("sheet_rate_line", {
                      waste: toLocaleDigits(String(sheet.waste_percent).replace(".", locale === "fa" ? "٫" : "."), locale),
                      profit: toLocaleDigits(String(sheet.target_profit_percent).replace(".", locale === "fa" ? "٫" : "."), locale),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {money(sheet.suggested_dine_in_minor ?? 0)}
                    <span className="text-muted-foreground ms-1 text-xs font-normal">/ {money(sheet.suggested_delivery_minor ?? 0)}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => editSheet(sheet)}>
                    {tCommon("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={tCommon("delete")}
                    onClick={() =>
                      confirm({
                        title: tCommon("delete"),
                        description: t("delete_confirm"),
                        onConfirm: () => remove.mutateAsync(sheet.id),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        </CafeSection>
      </CafeAdminShell>
    </TooltipProvider>
  )
}

/* ------------------------------------------------------------------ */

const TONE_CLASS: Record<string, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  healthy: "text-emerald-600 dark:text-emerald-400",
  typical: "text-amber-600 dark:text-amber-400",
  thin: "text-rose-600 dark:text-rose-400",
  bad: "text-rose-600 dark:text-rose-400",
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  const toneClass = (tone && TONE_CLASS[tone]) || ""
  return (
    <div className="rounded-lg border bg-background/70 px-2.5 py-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function MoneyField({
  label,
  hint,
  value,
  onChange,
  suffix,
  optional,
}: {
  label: string
  hint?: string
  value: string | number
  onChange: (value: string) => void
  suffix?: string
  optional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {optional ? <span className="text-muted-foreground text-xs font-normal">({hint})</span> : null}
      </Label>
      <div className="relative">
        <Input
          inputMode="numeric"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pe-14"
        />
        {suffix ? (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function PercentField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string | number
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground cursor-help text-xs">ⓘ</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </Label>
      <div className="relative">
        <Input
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pe-8"
        />
        <Percent className="text-muted-foreground pointer-events-none absolute inset-y-0 end-2.5 my-auto size-3.5" />
      </div>
    </div>
  )
}

/**
 * Turns monthly payroll + fixed costs into the two per-item shares the formula needs.
 * A cafe knows its rent and staff cost; it does not know "labour per latte".
 */
function OverheadAllocator({ onAllocate }: { onAllocate: (labour: string, fixed: string) => void }) {
  const t = useTranslations("cafe_admin.pricing")
  const locale = useLocale()
  const [labour, setLabour] = useState<string | number>("")
  const [fixed, setFixed] = useState<string | number>("")
  const [items, setItems] = useState<string | number>(3000)

  const allocated = allocateOverhead(num(labour), num(fixed), num(items, 1))
  const ready = num(items, 0) > 0 && (num(labour) > 0 || num(fixed) > 0)

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-2">
        <Users className="size-4" />
        <p className="text-sm font-semibold">{t("allocate_heading")}</p>
      </div>
      <p className="text-muted-foreground text-xs">{t("allocate_hint")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("monthly_labour")}</Label>
          <Input dir="ltr" inputMode="numeric" value={labour} onChange={(e) => setLabour(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("monthly_fixed")}</Label>
          <Input dir="ltr" inputMode="numeric" value={fixed} onChange={(e) => setFixed(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("monthly_items")}</Label>
          <Input dir="ltr" inputMode="numeric" value={items} onChange={(e) => setItems(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {t("allocate_result", {
            labour: toLocaleDigits(String(allocated.labour_cost), locale),
            fixed: toLocaleDigits(String(allocated.fixed_cost), locale),
          })}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!ready}
          onClick={() => onAllocate(String(allocated.labour_cost), String(allocated.fixed_cost))}
        >
          <Check className="size-4" />
          {t("allocate_apply")}
        </Button>
      </div>
    </div>
  )
}

/** «اگر این قیمت را بگیرم، چقدر می‌ماند؟» — the reverse question staff ask most often. */
function ReversePanel({
  rates,
  input,
  money,
}: {
  rates: PricingRates
  input: PricingInput
  money: (value: number) => ReactNode
}) {
  const t = useTranslations("cafe_admin.pricing")
  const locale = useLocale()
  const [price, setPrice] = useState<string | number>("")
  const [target, setTarget] = useState<string | number>(28)

  const reversed = useMemo(() => reversePrice(num(price), input), [price, input])
  const targetPrice = useMemo(
    () => priceForFoodCostTarget(input.ingredient_cost + input.packaging_cost, num(target, 28), rates),
    [input, target, rates],
  )

  return (
    <CafeSection title={t("reverse_heading")} description={t("reverse_hint")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("current_price")}</Label>
          <Input dir="ltr" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("food_cost_target")}</Label>
          <Input dir="ltr" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label={t("reverse_net")} value={money(reversed.net_minor)} tone={reversed.net_minor >= 0 ? "good" : "bad"} />
        <Stat label={t("net_margin")} value={`${toLocaleDigits(String(reversed.net_margin_percent).replace(".", locale === "fa" ? "٫" : "."), locale)}٪`} />
        <Stat label={t("food_cost")} value={`${toLocaleDigits(String(reversed.food_cost_percent).replace(".", locale === "fa" ? "٫" : "."), locale)}٪`} />
      </div>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Coins className="size-3.5" />
        {t("food_cost_target_result", { amount: formatMoneyText(targetPrice, locale) })}
      </p>
    </CafeSection>
  )
}

/** The derivation, line by line, so a manager can defend the number to the owner. */
function Breakdown({
  result,
  money,
  pct,
}: {
  result: PricingResult
  money: (value: number) => ReactNode
  pct: (value: number) => string
}) {
  const t = useTranslations("cafe_admin.pricing")
  const rows: { label: string; value: ReactNode; icon?: React.ReactNode; strong?: boolean }[] = [
    { label: t("row_waste"), value: money(result.costs.waste), icon: <Percent className="size-3.5" /> },
    { label: t("row_base_cost"), value: money(result.costs.base) },
    { label: t("row_full_cost"), value: money(result.costs.full), strong: true },
    { label: t("row_before_vat"), value: money(result.prices.beforeVat) },
    { label: t("row_vat"), value: money(result.prices.vat) },
  ]

  if (result.channel === "delivery") {
    rows.push({ label: t("row_platform_cut"), value: money(result.prices.platformCut) })
  }
  rows.push({ label: t("row_final"), value: money(result.prices.final), strong: true, icon: <Calculator className="size-3.5" /> })
  rows.push({
    label: t("row_net"),
    value: money(result.prices.net),
    icon: <TrendingUp className="size-3.5" />,
    strong: true,
  })

  return (
    <div className="mt-2 space-y-1 rounded-xl border p-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className={`flex items-center justify-between gap-2 ${row.strong ? "font-semibold" : ""}`}>
          <span className="text-muted-foreground flex items-center gap-1.5">
            {row.icon}
            {row.label}
          </span>
          <span className="tabular-nums">{row.value}</span>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <Receipt className="size-3.5" />
          {t("prime_cost")}
        </span>
        <span className="font-semibold">{pct(result.ratios.primeCostPercent)}</span>
      </div>
    </div>
  )
}
