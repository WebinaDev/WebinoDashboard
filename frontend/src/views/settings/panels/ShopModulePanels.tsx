"use client"

import { useTranslations } from "next-intl"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MarketplacePricingCard } from "@/views/settings/panels/marketplace/MarketplacePricingCard"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

function SimpleSwitchPanel({
  title,
  fields,
  area,
  section,
  sub,
}: {
  title: string
  fields: { key: string; label: string; type?: "switch" | "text" | "number" | "password" }[]
  area: string
  section: string
  sub?: string
}) {
  const t = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<
    Record<string, unknown>
  >(area, section, sub)

  if (loading || !draft) return <p className="text-muted-foreground text-sm">{t("loading")}</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((f) => {
            if (f.type === "switch" || f.type === undefined) {
              return (
                <div key={f.key} className="flex max-w-lg items-center justify-between gap-3">
                  <Label>{f.label}</Label>
                  <Switch
                    checked={Boolean(draft[f.key])}
                    onCheckedChange={(v) => setDraft({ ...draft, [f.key]: v })}
                  />
                </div>
              )
            }
            return (
              <div key={f.key} className="grid max-w-md gap-2">
                <Label>{f.label}</Label>
                <Input
                  type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [f.key]:
                        f.type === "number" ? Number(e.target.value) : e.target.value,
                    })
                  }
                  dir={f.type === "text" ? undefined : "ltr"}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}

export function PricingSettingsPanel() {
  const t = useTranslations("settings_hub")
  return (
    <div className="space-y-4">
      <SimpleSwitchPanel
        title={t("pricing.title")}
        area="shop"
        section="pricing"
        fields={[
          { key: "enable_wholesale", label: t("pricing.wholesale"), type: "switch" },
          { key: "enable_installment", label: t("pricing.installment"), type: "switch" },
          { key: "round_to", label: t("pricing.round_to"), type: "number" },
        ]}
      />
      <MarketplacePricingCard />
    </div>
  )
}

export { ShippingZonesPanel } from "@/views/settings/panels/ShippingZonesPanel"
export { ShippingTapinPanel } from "@/views/settings/panels/ShippingTapinPanel"

export function InvoicesSettingsPanel() {
  const t = useTranslations("settings_hub")
  return (
    <SimpleSwitchPanel
      title={t("invoices.title")}
      area="shop"
      section="invoices"
      fields={[
        { key: "company_name", label: t("invoices.company"), type: "text" },
        { key: "address", label: t("invoices.address"), type: "text" },
        { key: "phone", label: t("invoices.phone"), type: "text" },
        { key: "show_logo", label: t("invoices.show_logo"), type: "switch" },
        { key: "footer_note", label: t("invoices.footer"), type: "text" },
      ]}
    />
  )
}

export function AdvancedSettingsPanel() {
  const t = useTranslations("settings_hub")
  return (
    <SimpleSwitchPanel
      title={t("advanced.title")}
      area="shop"
      section="advanced"
      fields={[
        { key: "debug_mode", label: t("advanced.debug"), type: "switch" },
        { key: "legacy_api", label: t("advanced.legacy_api"), type: "switch" },
        { key: "delete_data_on_uninstall", label: t("advanced.delete_data"), type: "switch" },
      ]}
    />
  )
}
