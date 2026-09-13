import Link from "next/link"

import type { ResolvedAdminRoute, ResolvedSiteRoute } from "@/kernel/types"
import { getServerTranslations } from "@/lib/server-translations"
import { Button } from "@/components/ui/button"

type Props = {
  route: ResolvedAdminRoute | ResolvedSiteRoute
  area: "admin" | "site"
}

function resolveLabelKey(labelKey: string): { namespace: "nav" | "site" | "modules"; key: string } | null {
  if (labelKey.startsWith("nav.")) {
    return { namespace: "nav", key: labelKey.slice(4) }
  }
  if (labelKey.startsWith("site.")) {
    return { namespace: "site", key: labelKey.slice(5) }
  }
  return null
}

export default async function ModuleSkeletonPage({ route, area }: Props) {
  const t = await getServerTranslations("modules")
  const tNav = await getServerTranslations("nav")
  const tSite = await getServerTranslations("site")

  const parsed = resolveLabelKey(route.labelKey)
  let title: string
  if (parsed?.namespace === "nav") {
    title = tNav.has(parsed.key as never) ? tNav(parsed.key as never) : t("skeleton_coming_soon")
  } else if (parsed?.namespace === "site") {
    title = tSite.has(parsed.key as never) ? tSite(parsed.key as never) : t("skeleton_coming_soon")
  } else if (t.has(`names.${route.moduleSlug}` as never)) {
    title = t(`names.${route.moduleSlug}` as never)
  } else {
    title = t("skeleton_coming_soon")
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {area === "admin" ? t("area_admin") : t("area_site")}
        </p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <div className="border-border bg-muted/30 flex flex-col items-center gap-4 rounded-lg border border-dashed p-8 text-center text-sm">
        <p>{t("skeleton_placeholder")}</p>
        {area === "admin" ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/modules">{t("title")}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
