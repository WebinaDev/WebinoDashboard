"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Gift } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { MediaPickerField } from "@/components/content/MediaPickerField"
import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { MarketingSection } from "../lib/marketing-admin-ui"

type Reward = {
  id?: number
  uid?: string
  title: string
  image_url?: string | null
  points_cost: number
  discount_type: string
  discount_amount: number
  min_cart_minor?: number | null
  validity_days?: number | null
  is_active?: boolean
}

export default function GiftPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("marketing_loyalty_tools")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [rewards, setRewards] = useState<Reward[]>([])

  const { isLoading } = useQuery({
    queryKey: ["loyalty-rewards-marketing"],
    queryFn: async () => {
      const rows = await api<Reward[]>("/api/v1/loyalty/rewards")
      const list = Array.isArray(rows) ? rows : []
      setRewards(list)
      return list
    },
  })

  const save = useMutation({
    mutationFn: () =>
      api<Reward[]>("/api/v1/loyalty/rewards", {
        method: "PUT",
        json: { rewards },
      }),
    onSuccess: async (rows) => {
      setRewards(Array.isArray(rows) ? rows : [])
      toast.success(t("gift.saved"))
      await qc.invalidateQueries({ queryKey: ["loyalty-rewards-marketing"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  function patch(i: number, next: Partial<Reward>) {
    setRewards((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)))
  }

  return (
    <PageShell
      title={t("gift.title")}
      description={t("gift.subtitle")}
      eyebrow={t("eyebrow")}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href={dashboardPath("marketing/customer-return")}>{t("back_hub")}</Link>
          </Button>
          <Button disabled={save.isPending || isLoading} onClick={() => save.mutate()}>
            {tCommon("save")}
          </Button>
        </>
      }
    >
      <MarketingSection title={t("gift.list_heading")} description={t("gift.list_hint")} icon={Gift}>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
        ) : (
          <div className="space-y-4">
            {rewards.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("gift.empty")}</p>
            ) : null}
            {rewards.map((r, i) => (
              <div key={r.id ?? r.uid ?? i} className="space-y-3 rounded-lg border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label>{t("gift.reward_title")}</Label>
                    <Input value={r.title} onChange={(e) => patch(i, { title: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("gift.points_cost")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={r.points_cost}
                      onChange={(e) => patch(i, { points_cost: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("gift.discount_type")}</Label>
                    <Select
                      value={r.discount_type}
                      onValueChange={(v) => patch(i, { discount_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">{t("gift.percent")}</SelectItem>
                        <SelectItem value="fixed">{t("gift.fixed")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("gift.discount_amount")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={r.discount_amount}
                      onChange={(e) => patch(i, { discount_amount: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("gift.validity_days")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={r.validity_days ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        patch(i, {
                          validity_days: e.target.value === "" ? null : Number(e.target.value) || null,
                        })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <MediaPickerField
                      label={t("gift.image")}
                      accept="image"
                      imageUrl={r.image_url ?? ""}
                      onPick={(item) => patch(i, { image_url: item.url })}
                      onClear={() => patch(i, { image_url: null })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:col-span-2">
                    <Label>{t("gift.active")}</Label>
                    <Switch
                      checked={r.is_active !== false}
                      onCheckedChange={(v) => patch(i, { is_active: v })}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setRewards((prev) => prev.filter((_, j) => j !== i))}
                >
                  {t("gift.delete")}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRewards((prev) => [
                  ...prev,
                  {
                    title: "",
                    points_cost: 100,
                    discount_type: "percent",
                    discount_amount: 10,
                    is_active: true,
                    image_url: null,
                  },
                ])
              }
            >
              {t("gift.add")}
            </Button>
          </div>
        )}
      </MarketingSection>
    </PageShell>
  )
}
