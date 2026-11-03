"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, ChevronUp, Coins, Percent, Plus, Pencil, Trash2, Truck } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { cn } from "@/lib/utils"

type OfferTemplate = {
  id: string
  title: string
  condition_label: string
  icon: string
  type: string
  amount: string | number
  condition_type: string
  condition_value: string | number
  free_shipping?: boolean
  shipping_percent?: number | null
  max_discount_minor?: number | null
  coupon_id?: number | null
}

type OfferCoupon = {
  id: number
  code: string
  type: string
  amount: string
  title?: string
  condition_label?: string
  description?: string
  free_shipping?: boolean
  max_discount?: number | null
  shipping_percent?: number | null
  template_id?: string | null
}

type StorefrontSettings = {
  single_coupon: boolean
  cart_chooser: boolean
  progress_widget: boolean
  auto_apply: boolean
}

const STOREFRONT_KEYS: Array<keyof StorefrontSettings> = [
  "single_coupon",
  "cart_chooser",
  "progress_widget",
  "auto_apply",
]

function cleanNumber(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬,\s]/g, "")
    .replace(/٫/g, ".")
    .trim()
}

function TicketIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = cn("size-5", className)
  if (icon === "truck") return <Truck className={cls} />
  if (icon === "percent") return <Percent className={cls} />
  return <Coins className={cls} />
}

function iconForCoupon(c: OfferCoupon | OfferTemplate): string {
  if ("icon" in c && c.icon) return c.icon
  if (c.free_shipping || c.shipping_percent) return "truck"
  if (c.type === "percent") return "percent"
  return "coins"
}

function CouponTicketCard({
  title,
  condition,
  footer,
  icon,
  actions,
  accent = false,
}: {
  title: string
  condition: string
  footer?: ReactNode
  icon: string
  actions?: ReactNode
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm",
        "border-border/70",
      )}
    >
      <div className="flex flex-1 items-start gap-3 p-4 pe-3">
        <div className="min-w-0 flex-1 space-y-1 text-start">
          <p className="text-base font-semibold leading-snug">{title}</p>
          <p className="text-muted-foreground text-sm leading-snug">{condition}</p>
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            accent ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
          )}
        >
          <TicketIcon icon={icon} />
        </div>
      </div>
      <div className="relative mx-3 border-t border-dashed border-border/80">
        <span className="bg-background absolute -start-5 top-1/2 size-4 -translate-y-1/2 rounded-full border border-border/70" />
        <span className="bg-background absolute -end-5 top-1/2 size-4 -translate-y-1/2 rounded-full border border-border/70" />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="text-muted-foreground min-w-0 flex-1 text-sm">{footer}</div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
    </div>
  )
}

type RewardType = "fixed_cart" | "percent" | "free_shipping" | "ship_pct"

export function CouponBuilder({
  compactActions = false,
  initialReward,
  defaultWizardOpen = false,
}: {
  compactActions?: boolean
  initialReward?: RewardType
  defaultWizardOpen?: boolean
}) {
  const t = useTranslations("coupon_builder")
  const qc = useQueryClient()
  const [suggestedOpen, setSuggestedOpen] = useState(true)
  const [ownedOpen, setOwnedOpen] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(defaultWizardOpen || Boolean(initialReward))
  const [condType, setCondType] = useState<"order_nth" | "min_amount" | "min_items">("min_amount")
  const [condValue, setCondValue] = useState("1000000")
  const [rewardType, setRewardType] = useState<RewardType>(initialReward ?? "fixed_cart")
  const [rewardAmount, setRewardAmount] = useState(
    initialReward === "percent" || initialReward === "ship_pct" ? "10" : "50000",
  )

  const storefrontQ = useQuery({
    queryKey: ["coupons", "storefront-settings"],
    queryFn: () => api<StorefrontSettings>("/api/v1/marketing/coupons/storefront-settings"),
  })

  const saveStorefront = useMutation({
    mutationFn: (patch: Partial<StorefrontSettings>) =>
      api<StorefrontSettings>("/api/v1/marketing/coupons/storefront-settings", {
        method: "POST",
        json: patch,
      }),
    onSuccess: (res) => {
      qc.setQueryData(["coupons", "storefront-settings"], res)
      toast.success(t("saved"))
    },
    onError: (e: Error) => {
      void qc.invalidateQueries({ queryKey: ["coupons", "storefront-settings"] })
      toast.error(getApiErrorMessage(e))
    },
  })

  const templatesQ = useQuery({
    queryKey: ["coupons", "templates"],
    queryFn: async () => {
      const raw = await api<
        OfferTemplate[] | { data?: OfferTemplate[]; items?: OfferTemplate[]; owned?: Record<string, boolean> }
      >("/api/v1/marketing/coupons/offer-templates")
      const items = Array.isArray(raw) ? raw : (raw.items ?? raw.data ?? [])
      const owned =
        (!Array.isArray(raw) ? raw.owned : undefined) ??
        Object.fromEntries(items.map((row) => [row.id, Boolean(row.coupon_id)]))
      return { items, owned }
    },
  })

  const offersQ = useQuery({
    queryKey: ["coupons", "offers"],
    queryFn: async () => {
      const raw = await api<{ data?: { items?: OfferCoupon[] }; items?: OfferCoupon[] } | OfferCoupon[]>(
        "/api/v1/marketing/coupons/offers",
      )
      if (Array.isArray(raw)) return { items: raw }
      return { items: raw.items ?? raw.data?.items ?? [] }
    },
  })

  const addTemplate = useMutation({
    mutationFn: (template_id: string) =>
      api<{ already?: boolean; coupon?: OfferCoupon; data?: OfferCoupon }>(
        "/api/v1/marketing/coupons/from-template",
        { method: "POST", json: { template_id } },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["coupons"] })
      toast.success(res.already ? t("alreadyOwned") : t("added"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const trash = useMutation({
    mutationFn: (id: number) => api(`/api/v1/marketing/coupons/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["coupons"] })
      toast.success(t("trashed"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createWizard = useMutation({
    mutationFn: async () => {
      const cond = cleanNumber(condValue)
      const reward = cleanNumber(rewardAmount)
      const condNum = Number(cond)
      const rewardNum = Number(reward)
      if (!cond || !Number.isFinite(condNum) || condNum < 1) {
        throw new Error(t("errCondition"))
      }
      if (rewardType !== "free_shipping") {
        if (!reward || !Number.isFinite(rewardNum) || rewardNum <= 0) {
          throw new Error(t("errReward"))
        }
        if ((rewardType === "percent" || rewardType === "ship_pct") && rewardNum > 100) {
          throw new Error(t("errPercent"))
        }
      }
      const codeRes = await api<{ code: string }>("/api/v1/marketing/coupons/generate-code")
      const body: Record<string, unknown> = {
        code: codeRes.code,
        type: rewardType === "ship_pct" || rewardType === "free_shipping" ? "fixed_cart" : rewardType,
        amount: rewardType === "free_shipping" || rewardType === "ship_pct" ? 0 : Math.round(rewardNum),
        free_shipping: rewardType === "free_shipping",
        individual_use: true,
        status: "publish",
        condition_type: condType,
        condition_value: Math.round(condNum),
        auto_apply: true,
        description: "",
        restrictions: { is_offer: true },
        min_spend_minor: condType === "min_amount" ? Math.round(condNum) : null,
      }
      if (rewardType === "ship_pct") {
        body.shipping_percent = Math.round(rewardNum)
      }
      return api("/api/v1/marketing/coupons", { method: "POST", json: body })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["coupons"] })
      setWizardOpen(false)
      toast.success(t("added"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const ownedMap = templatesQ.data?.owned ?? {}
  const templates = templatesQ.data?.items ?? []
  const owned = offersQ.data?.items ?? []
  const note = useMemo(() => t("publicNote"), [t])

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">{note}</p>

      {!compactActions ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setWizardOpen((v) => !v)}>
            <Plus className="size-4" />
            {t("create")}
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href="/dashboard/marketing/coupons/new">{t("advanced")}</Link>
          </Button>
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href="/dashboard/marketing/coupons">{t("classicList")}</Link>
          </Button>
        </div>
      ) : null}

      {wizardOpen ? (
        <div className="border-border/70 space-y-4 rounded-2xl border p-4">
          <h2 className="text-base font-semibold">{t("wizardTitle")}</h2>
          <p className="text-muted-foreground text-sm">{t("wizardHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>{t("conditionType")}</Label>
              <Select value={condType} onValueChange={(v) => setCondType(v as typeof condType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order_nth">{t("cond.orderNth")}</SelectItem>
                  <SelectItem value="min_amount">{t("cond.minAmount")}</SelectItem>
                  <SelectItem value="min_items">{t("cond.minItems")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("conditionValue")}</Label>
              <Input inputMode="decimal" value={condValue} onChange={(e) => setCondValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("rewardType")}</Label>
              <Select
                value={rewardType}
                onValueChange={(v) => {
                  const next = v as typeof rewardType
                  const wasPct = rewardType === "percent" || rewardType === "ship_pct"
                  const isPct = next === "percent" || next === "ship_pct"
                  if (wasPct !== isPct) setRewardAmount(isPct ? "10" : "50000")
                  setRewardType(next)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_cart">{t("reward.fixed")}</SelectItem>
                  <SelectItem value="percent">{t("reward.percent")}</SelectItem>
                  <SelectItem value="free_shipping">{t("reward.freeShip")}</SelectItem>
                  <SelectItem value="ship_pct">{t("reward.shipPct")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rewardType !== "free_shipping" ? (
              <div className="space-y-2">
                <Label>{t("rewardAmount")}</Label>
                <Input inputMode="decimal" value={rewardAmount} onChange={(e) => setRewardAmount(e.target.value)} />
              </div>
            ) : null}
          </div>
          <Button type="button" onClick={() => createWizard.mutate()} disabled={createWizard.isPending}>
            {t("publish")}
          </Button>
        </div>
      ) : null}

      <section className="border-border/70 space-y-3 rounded-2xl border p-4">
        <div>
          <h2 className="text-base font-semibold">{t("storefront.title")}</h2>
          <p className="text-muted-foreground text-sm">{t("storefront.hint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {STOREFRONT_KEYS.map((key) => {
            const checked = storefrontQ.data ? Boolean(storefrontQ.data[key]) : true
            return (
              <label key={key} className="border-border/60 flex items-start justify-between gap-3 rounded-xl border p-3">
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-sm font-medium">{t(`storefront.${key}`)}</span>
                  <span className="text-muted-foreground block text-xs leading-relaxed">
                    {t(`storefront.${key}Hint`)}
                  </span>
                </span>
                <Switch
                  checked={checked}
                  disabled={!storefrontQ.data || saveStorefront.isPending}
                  onCheckedChange={(v) => {
                    if (!storefrontQ.data) return
                    qc.setQueryData(["coupons", "storefront-settings"], { ...storefrontQ.data, [key]: v })
                    saveStorefront.mutate({ [key]: v })
                  }}
                />
              </label>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("suggested")}</h2>
            <p className="text-muted-foreground text-sm">{t("suggestedHint")}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestedOpen((v) => !v)}>
            {suggestedOpen ? t("less") : t("more")}
            <ChevronUp className={cn("size-4 transition", !suggestedOpen && "rotate-180")} />
          </Button>
        </div>
        {suggestedOpen ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => {
              const ownedAlready = Boolean(ownedMap[tpl.id] ?? tpl.coupon_id)
              return (
                <CouponTicketCard
                  key={tpl.id}
                  title={tpl.title}
                  condition={tpl.condition_label}
                  icon={iconForCoupon(tpl)}
                  footer={
                    ownedAlready ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="size-3.5 text-emerald-600" />
                        {t("youHave")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-primary text-sm font-medium hover:underline"
                        disabled={addTemplate.isPending}
                        onClick={() => addTemplate.mutate(tpl.id)}
                      >
                        {t("addSuggested")}
                      </button>
                    )
                  }
                />
              )
            })}
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("owned")}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOwnedOpen((v) => !v)}>
            {ownedOpen ? t("less") : t("more")}
            <ChevronUp className={cn("size-4 transition", !ownedOpen && "rotate-180")} />
          </Button>
        </div>
        {ownedOpen ? (
          owned.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("ownedEmpty")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {owned.map((c) => {
                const title = c.title || c.description || c.code
                const condition = c.condition_label || c.code
                return (
                  <CouponTicketCard
                    key={c.id}
                    title={title}
                    condition={condition}
                    icon={iconForCoupon(c)}
                    accent
                    footer={
                      c.max_discount ? (
                        <span>{t("upTo", { amount: c.max_discount })}</span>
                      ) : (
                        <span className="font-mono text-xs tracking-wide">{c.code}</span>
                      )
                    }
                    actions={
                      <>
                        <Button type="button" size="icon" variant="ghost" className="size-8" asChild>
                          <Link href={`/dashboard/marketing/coupons/${c.id}`} title={t("edit")}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => trash.mutate(c.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    }
                  />
                )
              })}
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}
