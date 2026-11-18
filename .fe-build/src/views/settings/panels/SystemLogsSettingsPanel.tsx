"use client"

import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useDraftSettings } from "@/views/settings/use-tenant-settings"

type Payload = {
  log_file?: string
  size_bytes?: number
  modified_at?: string | null
  tail?: string[]
}

export function SystemLogsSettingsPanel() {
  const t = useTranslations("settings_hub.system_logs")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, refetchError, refetch, refetching } = useDraftSettings<Payload>(
    "site",
    "system-logs"
  )

  if (loading || !draft) {
    return <p className="text-muted-foreground text-sm">{tHub("loading")}</p>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {refetchError ? <p className="text-destructive">{refetchError}</p> : null}
          <p>
            {t("file")}: <span className="font-mono" dir="ltr">{draft.log_file}</span>
          </p>
          <p>
            {t("size")}: {draft.size_bytes ?? 0} B
          </p>
          {draft.modified_at ? (
            <p>
              {t("modified")}: <span dir="ltr">{draft.modified_at}</span>
            </p>
          ) : null}
          <pre
            className="bg-muted/40 max-h-96 overflow-auto rounded-lg border p-3 text-xs"
            dir="ltr"
          >
            {(draft.tail ?? []).join("\n") || t("empty")}
          </pre>
          <Button type="button" variant="secondary" disabled={refetching} onClick={() => void refetch()}>
            {t("refresh")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
