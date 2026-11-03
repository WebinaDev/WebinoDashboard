"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BookOpen, Settings } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type HubItem = {
  id: string
  title_key: string
  label_fa?: string
  label_en?: string
  category: string
  carrier_id: string
  enabled: boolean
  available: boolean
  configured?: boolean
  status?: string
  coming_soon?: boolean
  docs_url?: string | null
  supports?: string[]
  settings_path: string
}

type HubCategory = {
  id: string
  label_fa: string
  label_en: string
  order: number
}

type HubPayload = {
  items: HubItem[]
  categories?: HubCategory[]
  matrix?: { live: string[]; scaffold: string[] }
}

function itemTitle(item: HubItem, locale: string): string {
  if (locale.startsWith("fa") && item.label_fa) return item.label_fa
  if (item.label_en) return item.label_en
  return item.id
}

export function ShippingHubPanel() {
  const t = useTranslations("shipping_hub")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [query, setQuery] = useState("")

  const hubQ = useQuery({
    queryKey: ["shipping-hub"],
    queryFn: () => api<HubPayload>("/api/v1/shipping/hub"),
  })

  const toggle = useMutation({
    mutationFn: async (item: HubItem) =>
      api(`/api/v1/shipping/hub/${item.id}/toggle`, {
        method: "POST",
        json: { enabled: !item.enabled },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["shipping-hub"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const items = hubQ.data?.items ?? []
  const categories = useMemo(() => {
    const cats = [...(hubQ.data?.categories ?? [])].sort((a, b) => a.order - b.order)
    if (cats.length) return cats
    return [
      { id: "aggregator", label_fa: "تجمیع‌کننده", label_en: "Aggregators", order: 10 },
      { id: "courier", label_fa: "پیک", label_en: "Courier", order: 20 },
      { id: "post", label_fa: "پست", label_en: "Post", order: 30 },
      { id: "freight", label_fa: "باربری", label_en: "Freight", order: 40 },
    ]
  }, [hubQ.data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const title = itemTitle(item, locale).toLowerCase()
      return title.includes(q) || item.id.includes(q)
    })
  }, [items, query, locale])

  const enabledCount = items.filter((i) => i.enabled).length
  const liveCount = hubQ.data?.matrix?.live?.length ?? items.filter((i) => i.status === "live").length
  const scaffoldCount =
    hubQ.data?.matrix?.scaffold?.length ?? items.filter((i) => i.status === "scaffold").length

  return (
    <PageShell
      title={t("title")}
      description={t("subtitle")}
      eyebrow={t("eyebrow")}
      actions={
        <div className="text-muted-foreground space-y-0.5 text-xs">
          <p>{t("enabled_count", { count: enabledCount, total: items.length })}</p>
          <p>{t("matrix_hint", { live: liveCount, scaffold: scaffoldCount })}</p>
        </div>
      }
    >
      <div className="space-y-6">
        <p className="text-muted-foreground text-sm">{t("optional_apis")}</p>
        <Input
          className="max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
        />

        {hubQ.isLoading ? (
          <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
        ) : (
          categories.map((cat) => {
            const group = filtered.filter((item) => item.category === cat.id)
            if (!group.length) return null
            const catLabel = locale.startsWith("fa") ? cat.label_fa : cat.label_en
            return (
              <section key={cat.id} className="space-y-2">
                <h2 className="text-sm font-semibold tracking-tight">{catLabel}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.map((item) => {
                    const title = itemTitle(item, locale)
                    const soon = Boolean(item.coming_soon) || item.status === "scaffold"
                    return (
                      <div
                        key={item.id}
                        className="bg-background/60 flex items-start gap-3 rounded-xl border px-3 py-3"
                      >
                        <Switch
                          className="mt-1"
                          checked={item.enabled}
                          disabled={toggle.isPending}
                          onCheckedChange={() => void toggle.mutateAsync(item)}
                          aria-label={title}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-medium">{title}</p>
                            {soon ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {t("coming_soon")}
                              </Badge>
                            ) : item.configured ? (
                              <Badge variant="outline" className="text-[10px]">
                                {t("status_live")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                {t("status_needs_keys")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {soon
                              ? item.docs_url
                                ? t("scaffold_hint")
                                : t("scaffold_no_docs")
                              : t("configure_hint")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {item.docs_url ? (
                            <Button type="button" variant="ghost" size="icon" asChild>
                              <a
                                href={item.docs_url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t("docs")}
                              >
                                <BookOpen className="size-4" />
                              </a>
                            </Button>
                          ) : null}
                          {item.settings_path ? (
                            <Button type="button" variant="ghost" size="icon" asChild>
                              <Link href={item.settings_path} aria-label={t("open_settings")}>
                                <Settings className="size-4" />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })
        )}
      </div>
    </PageShell>
  )
}
