"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MARKETPLACE_SETTINGS_BASE, marketplaceLabel, marketplaceMeta } from "@/lib/marketplace"

export function MarketplaceComingSoonPanel({ platform }: { platform: string }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const meta = marketplaceMeta(platform)
  const title = marketplaceLabel(platform, locale)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary">{t("hub.coming_soon")}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("hub.coming_soon")}</CardTitle>
          <CardDescription>
            {t.has(`descriptions.${platform}`) ? t(`descriptions.${platform}`) : t("hub.coming_soon_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">{t("hub.scaffold_body")}</p>
          {meta ? (
            <p className="text-muted-foreground text-xs">
              {t(`hub.category_hint.${meta.category}`)}
            </p>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={MARKETPLACE_SETTINGS_BASE}>{t("hub.back_to_hub")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
