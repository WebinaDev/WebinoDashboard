"use client"

import { useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { OrderDocumentsSettings } from "@/lib/order-print"
import { selectClass } from "@/views/settings/panels/marketplace/MarketplaceShared"
import { SettingsSaveBar, useDraftSettings } from "@/views/settings/use-tenant-settings"

const TABS = ["general", "sender", "invoice", "receipt", "label", "packing", "product"] as const
type TabKey = (typeof TABS)[number]

const INVOICE_THEMES = ["classic", "modern", "band", "boxed", "stripe", "compact", "landscape"]
const RECEIPT_THEMES = ["classic", "modern", "band", "compact"]
const LABEL_THEMES = ["stacked", "rows", "classic", "modern", "iran", "stamp"]
const PACKING_THEMES = ["classic", "band", "compact"]
const LABEL_SIZES = ["A5", "100x150", "100x100"]
const STICKER_SIZES = ["100x70", "100x100"]
const PRODUCT_LABEL_SIZES = ["40x30", "50x30", "58x40", "60x40", "80x50", "100x50"]

export function OrderDocumentsSettingsPanel() {
  const t = useTranslations("order_documents")
  const tHub = useTranslations("settings_hub")
  const [tab, setTab] = useState<TabKey>("general")
  const { loading, draft, setDraft, persist, pending, saved, error, refetchError } =
    useDraftSettings<OrderDocumentsSettings>("shop", "invoices")

  if (refetchError) return <p className="text-destructive text-sm">{refetchError}</p>
  if (loading || !draft) return <p className="text-muted-foreground text-sm">{tHub("loading")}</p>

  const str = (k: string) => String(draft[k] ?? "")
  const bool = (k: string) => Boolean(draft[k])
  const set = (k: string, v: string | boolean) => setDraft({ ...draft, [k]: v })

  const toggle = (k: string, hint?: string) => (
    <label
      key={k}
      htmlFor={`od-${k}`}
      className="bg-muted/30 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5"
    >
      <span className="min-w-0">
        <span className="block text-sm">{t(`fields.${k}`)}</span>
        {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
      </span>
      <Switch id={`od-${k}`} checked={bool(k)} onCheckedChange={(v) => set(k, v === true)} />
    </label>
  )

  const text = (k: string, opts: { ltr?: boolean; hint?: string; multiline?: boolean } = {}) => (
    <div key={k} className="grid gap-2">
      <Label htmlFor={`od-${k}`}>{t(`fields.${k}`)}</Label>
      {opts.multiline ? (
        <Textarea id={`od-${k}`} rows={3} value={str(k)} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <Input
          id={`od-${k}`}
          value={str(k)}
          dir={opts.ltr ? "ltr" : undefined}
          onChange={(e) => set(k, e.target.value)}
        />
      )}
      {opts.hint ? <p className="text-muted-foreground text-xs">{opts.hint}</p> : null}
    </div>
  )

  const select = (k: string, options: string[], labelPrefix?: string) => (
    <div key={k} className="grid gap-2">
      <Label htmlFor={`od-${k}`}>{t(`fields.${k}`)}</Label>
      <select id={`od-${k}`} className={selectClass} value={str(k)} onChange={(e) => set(k, e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {labelPrefix ? t(`${labelPrefix}.${o}`) : o}
          </option>
        ))}
      </select>
    </div>
  )

  const themeGrid = (k: string, options: string[]) => (
    <div className="grid gap-2">
      <Label>{t(`fields.${k}`)}</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((o) => {
          const selected = str(k) === o
          return (
            <button
              key={o}
              type="button"
              onClick={() => set(k, o)}
              aria-pressed={selected}
              className={cn(
                "rounded-xl border px-3 py-3 text-start text-sm transition",
                selected ? "border-primary ring-primary/30 ring-2" : "hover:bg-muted/50"
              )}
            >
              <span
                className="mb-2 block h-1.5 w-10 rounded-full"
                style={{ background: selected ? str("accent_color") || "#e775ae" : "var(--border)" }}
                aria-hidden
              />
              {t(`themes.${o}`)}
            </button>
          )
        })}
      </div>
    </div>
  )

  const section = (title: string, children: ReactNode, description?: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )

  const content: Record<TabKey, ReactNode> = {
    general: (
      <>
        {section(
          t("tabs.general"),
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "enable_invoice",
              "enable_receipt",
              "enable_label",
              "enable_packing",
              "enable_customer_label",
              "enable_store_label",
              "enable_product_label",
            ].map((k) => toggle(k))}
          </div>,
          t("enable_hint")
        )}
        {section(
          t("appearance"),
          <div className="grid gap-4 sm:grid-cols-2">
            {text("store_name")}
            {text("footer_site", { ltr: true })}
            <div className="grid gap-2">
              <Label htmlFor="od-accent_color">{t("fields.accent_color")}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t("fields.accent_color")}
                  value={/^#[0-9a-f]{6}$/i.test(str("accent_color")) ? str("accent_color") : "#e775ae"}
                  onChange={(e) => set("accent_color", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border"
                />
                <Input
                  id="od-accent_color"
                  dir="ltr"
                  value={str("accent_color")}
                  onChange={(e) => set("accent_color", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </>
    ),
    sender: section(
      t("tabs.sender"),
      <div className="grid gap-4 sm:grid-cols-2">
        {text("sender_name", { hint: t("hints.sender_name") })}
        {text("sender_phone", { ltr: true })}
        {text("sender_postcode", { ltr: true })}
        {text("sender_email", { ltr: true, hint: t("hints.sender_email") })}
        <div className="sm:col-span-2">{text("sender_address", { multiline: true })}</div>
      </div>
    ),
    invoice: section(
      t("tabs.invoice"),
      <>
        {themeGrid("invoice_theme", INVOICE_THEMES)}
        <div className="grid gap-4 sm:grid-cols-2">
          {select("invoice_orientation", ["portrait", "landscape"], "orientations")}
          {select("invoice_parties_order", ["sender_first", "recipient_first"], "parties")}
          {text("invoice_logo_url", { ltr: true, hint: t("hints.logo_url") })}
          {text("invoice_thanks")}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {["invoice_show_status", "invoice_show_barcode", "invoice_show_product_image", "invoice_show_sku"].map((k) =>
            toggle(k)
          )}
        </div>
      </>
    ),
    receipt: section(
      t("tabs.receipt"),
      <>
        {themeGrid("receipt_theme", RECEIPT_THEMES)}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("receipt_logo_url", { ltr: true, hint: t("hints.logo_url") })}
          {text("receipt_thanks")}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {toggle("receipt_show_barcode")}
          {toggle("receipt_show_items_table")}
        </div>
      </>
    ),
    label: (
      <>
        {section(
          t("tabs.label"),
          <>
            {themeGrid("label_theme", LABEL_THEMES)}
            <div className="grid gap-4 sm:grid-cols-3">
              {select("label_size", LABEL_SIZES)}
              {select("label_orientation", ["portrait", "landscape"], "orientations")}
              {text("label_logo_url", { ltr: true, hint: t("hints.logo_url") })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("label_note")}
              {text("label_postman_title")}
              {text("label_postman_hint")}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {toggle("label_show_barcode")}
              {toggle("label_show_postman_placeholder")}
            </div>
          </>
        )}
        {section(
          t("stickers"),
          <div className="grid gap-4 sm:grid-cols-2">
            {select("customer_label_size", STICKER_SIZES)}
            {select("store_label_size", STICKER_SIZES)}
          </div>
        )}
      </>
    ),
    packing: section(t("tabs.packing"), themeGrid("packing_theme", PACKING_THEMES), t("packing_hint")),
    product: section(
      t("tabs.product"),
      <div className="grid gap-4 sm:grid-cols-2">
        {select("product_label_size", PRODUCT_LABEL_SIZES)}
        {toggle("product_label_split_variations", t("hints.split_variations"))}
      </div>,
      t("product_hint")
    ),
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b pb-2" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition",
              tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      {content[tab]}
      <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
    </div>
  )
}
