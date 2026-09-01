import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { Button } from "@/components/ui/button"

import CataloguePage from "@/kernel/pages/CataloguePage"
import { getPublicActivations, isSubmoduleEnabled } from "@/kernel/site-home"
import { getSiteTypeSlug } from "@/kernel/cafe-catalogue-data"

export const revalidate = 60

export default async function SiteHomePage() {
  const t = await getTranslations("site")
  const siteType = await getSiteTypeSlug()
  const activations = await getPublicActivations()

  if (siteType === "cafe" && isSubmoduleEnabled(activations, "commerce", "catalog")) {
    return <CataloguePage />
  }

  let home: {
    tenant: { name: string; active_theme_slug?: string | null }
    blocks: { type: string; enabled?: boolean }[]
  } | null = null

  try {
    const { apiServer } = await import("@/lib/api-server")
    const res = await apiServer<{
      data: {
        tenant: { name: string; active_theme_slug?: string | null }
        blocks: { type: string; enabled?: boolean }[]
      }
    }>("/api/v1/public/home")
    home = res?.data ?? null
  } catch {
    home = null
  }

  const name = home?.tenant?.name ?? t("default_site_name")

  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold">{name}</h1>
      <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-sm">
        {t("home_welcome")}
      </p>
      <Button asChild className="mt-8">
        <Link href="/consultation">{t("cta_consultation")}</Link>
      </Button>
    </div>
  )
}
