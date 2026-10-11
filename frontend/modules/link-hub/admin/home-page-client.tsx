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

export default function HomePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("link_hub")
  const [data, setData] = useState<LinkHubOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<LinkHubOverview>("/api/v1/link-hub/overview")
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

  return (
    <PageShell title={t("title")} description={t("home_desc")}>
      {loading ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : (
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
      )}
    </PageShell>
  )
}
