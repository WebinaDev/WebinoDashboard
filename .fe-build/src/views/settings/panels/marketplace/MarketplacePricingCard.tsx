"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { MARKETPLACE_PLATFORMS, marketplaceLabel } from "@/lib/marketplace"
import { selectClass } from "@/views/settings/panels/marketplace/MarketplaceShared"

type PlatformPricing = {
  enabled: boolean
  profit_percent: number
  extra_percent: number
  round_to: number
  price_unit: "rial" | "toman"
  price_mode: "retail" | "markup"
  use_sale_price: boolean
}

export function MarketplacePricingCard() {
  const t = useTranslations("marketplace_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, PlatformPricing> | null>(null)

  const q = useQuery({
    queryKey: ["marketplace-pricing"],
    queryFn: () => api<Record<string, PlatformPricing>>("/api/v1/marketplace/pricing"),
    retry: false,
  })
  useEffect(() => {
    if (q.data) setDraft(structuredClone(q.data))
  }, [q.data])

  const save = useMutation({
    mutationFn: (platforms: Record<string, PlatformPricing>) =>
      api<Record<string, PlatformPricing>>("/api/v1/marketplace/pricing", { method: "PUT", json: { platforms } }),
    onSuccess: (data) => {
      qc.setQueryData(["marketplace-pricing"], data)
      toast.success(tCommon("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.error || !draft) return null

  const patch = (slug: string, key: keyof PlatformPricing, value: unknown) =>
    setDraft((d) => (d ? { ...d, [slug]: { ...d[slug], [key]: value } } : d))

  const groups: { kind: "api" | "feed"; title: string }[] = [
    { kind: "api", title: t("hub.marketplaces") },
    { kind: "feed", title: t("hub.search_engines") },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("pricing.title")}</CardTitle>
        <CardDescription>{t("pricing.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map((g) => (
          <div key={g.kind} className="space-y-2">
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pricing.platform")}</TableHead>
                    <TableHead>{t("pricing.enabled")}</TableHead>
                    <TableHead>{t("pricing.mode")}</TableHead>
                    <TableHead>{t("pricing.profit")}</TableHead>
                    <TableHead>{t("pricing.extra")}</TableHead>
                    <TableHead>{t("pricing.round_to")}</TableHead>
                    <TableHead>{t("pricing.unit")}</TableHead>
                    <TableHead>{t("pricing.use_sale")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MARKETPLACE_PLATFORMS.filter((p) => p.kind === g.kind && draft[p.slug]).map((p) => {
                    const row = draft[p.slug]
                    return (
                      <TableRow key={p.slug}>
                        <TableCell className="font-medium whitespace-nowrap">{marketplaceLabel(p.slug, locale)}</TableCell>
                        <TableCell>
                          <Switch checked={row.enabled} onCheckedChange={(v) => patch(p.slug, "enabled", v)} />
                        </TableCell>
                        <TableCell>
                          <select className={selectClass} value={row.price_mode} onChange={(e) => patch(p.slug, "price_mode", e.target.value)}>
                            <option value="markup">{t("pricing.mode_markup")}</option>
                            <option value="retail">{t("pricing.mode_retail")}</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <Input className="w-20" type="number" dir="ltr" value={row.profit_percent} disabled={row.price_mode === "retail"} onChange={(e) => patch(p.slug, "profit_percent", Number(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-20" type="number" dir="ltr" value={row.extra_percent} disabled={row.price_mode === "retail"} onChange={(e) => patch(p.slug, "extra_percent", Number(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-24" type="number" dir="ltr" min={1} value={row.round_to} onChange={(e) => patch(p.slug, "round_to", Math.max(1, Number(e.target.value) || 1))} />
                        </TableCell>
                        <TableCell>
                          <select className={selectClass} value={row.price_unit} onChange={(e) => patch(p.slug, "price_unit", e.target.value)}>
                            <option value="toman">{t("pricing.toman")}</option>
                            <option value="rial">{t("pricing.rial")}</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <Switch checked={row.use_sale_price} onCheckedChange={(v) => patch(p.slug, "use_sale_price", v)} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
        <p className="text-muted-foreground text-xs">{t("pricing.footnote")}</p>
        <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
          {tCommon("save")}
        </Button>
      </CardContent>
    </Card>
  )
}
