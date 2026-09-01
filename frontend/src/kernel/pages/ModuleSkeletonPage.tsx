import type { ResolvedAdminRoute, ResolvedSiteRoute } from "@/kernel/types"
import { getTranslations } from "next-intl/server"

type Props = {
  route: ResolvedAdminRoute | ResolvedSiteRoute
  area: "admin" | "site"
}

export default async function ModuleSkeletonPage({ route, area }: Props) {
  const t = await getTranslations("modules")

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {area === "admin" ? "Admin" : "Site"} / {route.moduleSlug} / {route.submodule}
        </p>
        <h1 className="text-2xl font-semibold">
          {route.moduleSlug}.{route.submodule}
        </h1>
      </div>
      <div className="border-border bg-muted/30 rounded-lg border border-dashed p-8 text-center text-sm">
        {t("skeleton_placeholder")}
      </div>
    </div>
  )
}
