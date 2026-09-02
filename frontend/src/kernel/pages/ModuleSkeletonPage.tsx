import Link from "next/link"

import type { ResolvedAdminRoute, ResolvedSiteRoute } from "@/kernel/types"
import { getServerTranslations } from "@/lib/server-translations"
import { Button } from "@/components/ui/button"

type Props = {
  route: ResolvedAdminRoute | ResolvedSiteRoute
  area: "admin" | "site"
}

export default async function ModuleSkeletonPage({ route, area }: Props) {
  const t = await getServerTranslations("modules")

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {area === "admin" ? t("area_admin") : t("area_site")} / {route.moduleSlug} /{" "}
          {route.submodule}
        </p>
        <h1 className="text-2xl font-semibold">
          {route.moduleSlug}.{route.submodule}
        </h1>
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
