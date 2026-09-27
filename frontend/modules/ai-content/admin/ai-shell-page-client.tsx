"use client"

import { useTranslations } from "next-intl"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { AiSectionPanel } from "./ai-panels"

export default function AiShellPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("aiContent")
  const section =
    route.path === "ai-content" || route.path === "ai-content/"
      ? "overview"
      : route.path.replace(/^ai-content\//, "") || "overview"

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t(`sections.${section}` as never)}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>
      <AiSectionPanel section={section} />
    </div>
  )
}
