"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Gift, Percent, ShoppingBasket, Truck } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { CONDITION_TYPES } from "@/components/coupons/CouponOfferPanel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { cn } from "@/lib/utils"

const REWARD_TYPES = ["percent", "fixed", "free_shipping", "shipping_percent"] as const
type RewardType = (typeof REWARD_TYPES)[number]

type Draft = {
  conditionType: string
  conditionValue: string
  rewardType: RewardType
  rewardValue: string
  autoApply: boolean
}

const TEMPLATES: { id: "first_order" | "free_shipping_over" | "buy_n_items"; icon: typeof Gift; draft: Draft }[] = [
  {
    id: "first_order",
    icon: Gift,
    draft: { conditionType: "order_nth", conditionValue: "1", rewardType: "percent", rewardValue: "10", autoApply: true },
  },
  {
    id: "free_shipping_over",
    icon: Truck,
    draft: { conditionType: "min_amount", conditionValue: "1000000", rewardType: "free_shipping", rewardValue: "", autoApply: true },
  },
  {
    id: "buy_n_items",
    icon: ShoppingBasket,
    draft: { conditionType: "min_items", conditionValue: "3", rewardType: "percent", rewardValue: "15", autoApply: false },
  },
]

const EMPTY: Draft = { conditionType: "none", conditionValue: "", rewardType: "percent", rewardValue: "10", autoApply: false }

type CreatedCoupon = { id: number; code: string }

export function CouponBuilder({ onCreated }: { onCreated?: (coupon: CreatedCoupon) => void }) {
  const t = useTranslations("coupon_builder")
  const tc = useTranslations("coupons")
  const enumLabel = useEnumLabel()
  const qc = useQueryClient()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [template, setTemplate] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("publish")
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedCoupon | null>(null)

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const needsRewardValue = draft.rewardType !== "free_shipping"

  function reset() {
    setStep(0)
    setDraft(EMPTY)
    setTemplate(null)
    setCode("")
    setDescription("")
    setStatus("publish")
    setError(null)
  }

  function payload() {
    const value = Number(draft.rewardValue) || 0
    return {
      code,
      description: description || null,
      status,
      type: draft.rewardType === "fixed" ? "fixed_cart" : "percent",
      amount: draft.rewardType === "percent" || draft.rewardType === "fixed" ? value : 0,
      free_shipping: draft.rewardType === "free_shipping",
      shipping_percent: draft.rewardType === "shipping_percent" ? Math.min(100, value) : null,
      condition_type: draft.conditionType,
      condition_value: draft.conditionType !== "none" && draft.conditionValue ? Number(draft.conditionValue) : null,
      auto_apply: draft.autoApply,
    }
  }

  const generate = useMutation({
    mutationFn: () => api<{ code: string }>("/api/v1/marketing/coupons/generate-code"),
    onSuccess: (d) => setCode(d.code),
  })

  const save = useMutation({
    mutationFn: () => api<CreatedCoupon>("/api/v1/marketing/coupons", { method: "POST", json: payload() }),
    onSuccess: async (data) => {
      setError(null)
      setCreated(data)
      await qc.invalidateQueries({ queryKey: ["coupons"] })
      onCreated?.(data)
      reset()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const steps = [t("steps.condition"), t("steps.reward"), t("steps.finish")]
  const conditionOk = draft.conditionType === "none" || Number(draft.conditionValue) > 0
  const rewardOk = !needsRewardValue || Number(draft.rewardValue) > 0

  return (
    <div className="space-y-4">
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">{t("templates.title")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className={cn(
                    "hover:border-primary rounded-lg border p-3 text-start transition-colors",
                    template === tpl.id && "border-primary bg-primary/5",
                  )}
                  onClick={() => {
                    setTemplate(tpl.id)
                    setDraft(tpl.draft)
                    setStep(0)
                  }}
                >
                  <Icon className="text-primary mb-2 size-5" />
                  <p className="text-sm font-medium">{t(`templates.${tpl.id}`)}</p>
                  <p className="text-muted-foreground text-xs">{t(`templates.${tpl.id}_desc`)}</p>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {created ? (
        <p className="text-sm text-green-700">
          {t("created", { code: created.code })}{" "}
          <Link className="underline" href={`/dashboard/marketing/coupons/${created.id}`}>
            {t("openEditor")}
          </Link>
        </p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            {steps.map((label, i) => (
              <button
                key={label}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  i === step ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
                )}
                onClick={() => setStep(i)}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{tc("offer.condition_type")}</Label>
                <Select value={draft.conditionType} onValueChange={(v) => patch({ conditionType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tc(`conditionTypes.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="builder-condition-value">{tc("offer.condition_value")}</Label>
                <Input
                  id="builder-condition-value"
                  type="number"
                  min={0}
                  disabled={draft.conditionType === "none"}
                  value={draft.conditionValue}
                  onChange={(e) => patch({ conditionValue: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-4">
                {REWARD_TYPES.map((rt) => {
                  const Icon = rt === "free_shipping" || rt === "shipping_percent" ? Truck : Percent
                  return (
                    <button
                      key={rt}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2 text-sm",
                        draft.rewardType === rt && "border-primary bg-primary/5",
                      )}
                      onClick={() => patch({ rewardType: rt })}
                    >
                      <Icon className="size-4" />
                      {t(`rewardTypes.${rt}`)}
                    </button>
                  )
                })}
              </div>
              {needsRewardValue ? (
                <div className="max-w-xs space-y-1">
                  <Label htmlFor="builder-reward-value">{t("fields.reward_value")}</Label>
                  <Input
                    id="builder-reward-value"
                    type="number"
                    min={0}
                    max={draft.rewardType === "fixed" ? undefined : 100}
                    value={draft.rewardValue}
                    onChange={(e) => patch({ rewardValue: e.target.value })}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="builder-code">{t("fields.code")}</Label>
                  <Input
                    id="builder-code"
                    className="font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </div>
                <Button type="button" className="mt-6" variant="secondary" onClick={() => generate.mutate()}>
                  {t("actions.generate")}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.autoApply} onCheckedChange={(v) => patch({ autoApply: v === true })} />
                {t("fields.auto_apply")}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("fields.status")}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["publish", "draft"] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {enumLabel("product_status", value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="builder-description">{t("fields.description")}</Label>
                <Textarea id="builder-description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="bg-muted/50 space-y-1 rounded-md p-3 text-sm">
                <p className="font-medium">{t("summary")}</p>
                <p>
                  {tc(`conditionTypes.${draft.conditionType}`)}
                  {draft.conditionType !== "none" && draft.conditionValue ? ` · ${draft.conditionValue}` : ""}
                </p>
                <p>
                  {t(`rewardTypes.${draft.rewardType}`)}
                  {needsRewardValue && draft.rewardValue ? ` · ${draft.rewardValue}` : ""}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              {t("actions.reset")}
            </Button>
            <div className="flex gap-2">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                  {t("actions.back")}
                </Button>
              ) : null}
              {step < 2 ? (
                <Button
                  type="button"
                  disabled={(step === 0 && !conditionOk) || (step === 1 && !rewardOk)}
                  onClick={() => setStep(step + 1)}
                >
                  {t("actions.next")}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={save.isPending || !code || !conditionOk || !rewardOk}
                  onClick={() => save.mutate()}
                >
                  {t("actions.create")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
