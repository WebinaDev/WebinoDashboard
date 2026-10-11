"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import type { LinkHubOverview } from "../lib/types"

type Stats = {
  views: number
  visitors: number
  clicks: number
  ctr: number
  days: number
}

type Overview = LinkHubOverview & { stats?: Stats }

export default function HomePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("link_hub")
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<Overview>("/api/v1/link-hub/overview")
        if (!cancelled) setData(res)
      } catch {
        toast.error(t("load_error"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  async function copyUrl() {
    if (!data?.public_url) return
    try {
      await navigator.clipboard.writeText(data.public_url)
      toast.success(t("copied"))
    } catch {
      toast.error(t("copy_failed"))
    }
  }

  const qrSrc = data?.public_url
    ? `https://quickchart.io/qr?text=${encodeURIComponent(data.public_url)}&size=220&margin=1`
    : null

  const stats = data?.stats

  return (
    <PageShell title={t("title")} description={t("home_desc")}>
      {loading ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-3 rounded-2xl border p-5 sm:grid-cols-2 lg:grid-cols-4">
            <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-4">{t("stats_title")}</h2>
            {stats && (stats.views > 0 || stats.clicks > 0) ? (
              <>
                <StatCard label={t("stats_views")} value={String(stats.views)} />
                <StatCard label={t("stats_visitors")} value={String(stats.visitors)} />
                <StatCard label={t("stats_clicks")} value={String(stats.clicks)} />
                <StatCard label={t("stats_ctr")} value={`${stats.ctr}%`} />
              </>
            ) : (
              <p className="text-muted-foreground text-sm sm:col-span-2 lg:col-span-4">{t("stats_empty")}</p>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="space-y-4 rounded-2xl border p-5">
              <h2 className="text-lg font-semibold">{t("my_link")}</h2>
              <p className="text-muted-foreground text-sm" dir="ltr">
                {data?.public_url || t("no_domain")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={copyUrl} disabled={!data?.public_url}>
                  {t("copy_link")}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/link-hub/page">{t("edit_page")}</Link>
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/link-hub/profiles">{t("profiles")}</Link>
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/link-hub/inbox">{t("inbox")}</Link>
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/link-hub/settings">{t("settings")}</Link>
                </Button>
              </div>
              {data?.dns_hint ? (
                <p className="text-muted-foreground text-xs leading-6">{data.dns_hint}</p>
              ) : null}
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("alias_label")}</dt>
                  <dd dir="ltr">{data?.alias_subdomain}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("members")}</dt>
                  <dd>{data?.member_count ?? 0}</dd>
                </div>
              </dl>
            </section>
            <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border p-5">
              <h2 className="text-lg font-semibold">{t("qr_title")}</h2>
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrSrc} alt={t("qr_title")} width={220} height={220} className="rounded-lg bg-white p-2" />
              ) : (
                <p className="text-muted-foreground text-sm">{t("no_domain")}</p>
              )}
            </section>
          </div>
        </div>
      )}
    </PageShell>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-4 py-3">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}
