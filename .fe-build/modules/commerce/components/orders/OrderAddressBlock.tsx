"use client"

import { useLocale, useTranslations } from "next-intl"

import { localizeDigits } from "@/lib/digits"

type Structured = {
  province_code?: string
  city?: string
  plaque?: string
  unit?: string
  postcode?: string
  address?: string
}

function parseStructuredAddress(raw: unknown): Structured {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  return {
    province_code: String(o.province_code ?? o.state ?? ""),
    city: typeof o.city === "string" ? o.city : "",
    plaque: typeof o.plaque === "string" ? o.plaque : "",
    unit: typeof o.unit === "string" ? o.unit : "",
    postcode: typeof o.postcode === "string" ? o.postcode : "",
    address: typeof o.address === "string" ? o.address : typeof o.address_1 === "string" ? o.address_1 : "",
  }
}

type OrderAddressBlockProps = {
  address?: unknown
  showEmail?: boolean
}

function FieldRow({ label, value, locale }: { label: string; value?: string | null; locale: string }) {
  if (!value?.trim()) return null
  return (
    <p className="text-sm">
      <span className="text-foreground font-medium">{label}: </span>
      <span className="text-muted-foreground">{localizeDigits(value, locale)}</span>
    </p>
  )
}

function displayName(o: Record<string, unknown>): string {
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim()
  return [o.first_name, o.last_name]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(" ")
}

/** Address fields styled like WP `OrderAddressBlock` (label: value rows). */
export function OrderAddressBlock({ address, showEmail = true }: OrderAddressBlockProps) {
  const t = useTranslations("orders_admin")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const empty = tCommon("em_dash")

  if (!address) {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }

  if (typeof address === "string") {
    return <p className="whitespace-pre-wrap text-sm">{address.trim() || empty}</p>
  }

  if (typeof address !== "object") {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }

  const o = address as Record<string, unknown>
  const structured = parseStructuredAddress(address)
  const name = displayName(o)
  const company = typeof o.company === "string" ? o.company : ""
  const email = typeof o.email === "string" ? o.email : ""
  const phone = typeof o.phone === "string" ? o.phone : ""
  const state = structured.province_code || (typeof o.state === "string" ? o.state : "")
  const city = structured.city || (typeof o.city === "string" ? o.city : "")
  const street =
    structured.address ||
    [o.address_1, o.address_2]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
      .join(" · ")
  const plaque = structured.plaque
  const unit = structured.unit
  const postcode = structured.postcode || (typeof o.postcode === "string" ? o.postcode : "")

  const hasContent =
    name ||
    company ||
    (showEmail && email) ||
    phone ||
    state ||
    city ||
    street ||
    plaque ||
    unit ||
    postcode

  if (!hasContent) {
    return <p className="text-muted-foreground text-sm">{empty}</p>
  }

  return (
    <div className="space-y-1">
      <FieldRow label={t("customer_name")} value={name} locale={locale} />
      <FieldRow label={t("addr_company")} value={company} locale={locale} />
      {showEmail ? <FieldRow label={t("customer_email")} value={email} locale={locale} /> : null}
      <FieldRow label={t("customer_phone")} value={phone} locale={locale} />
      <FieldRow label={t("province")} value={state} locale={locale} />
      <FieldRow label={t("city")} value={city} locale={locale} />
      <FieldRow label={t("address_1")} value={street} locale={locale} />
      {plaque || unit ? (
        <p className="text-sm">
          {plaque ? (
            <>
              <span className="text-foreground font-medium">{t("plaque")}: </span>
              <span className="text-muted-foreground">{localizeDigits(plaque, locale)}</span>
            </>
          ) : null}
          {plaque && unit ? <span className="text-muted-foreground"> · </span> : null}
          {unit ? (
            <>
              <span className="text-foreground font-medium">{t("unit")}: </span>
              <span className="text-muted-foreground">{localizeDigits(unit, locale)}</span>
            </>
          ) : null}
        </p>
      ) : null}
      <FieldRow label={t("postcode")} value={postcode} locale={locale} />
    </div>
  )
}

export function addressesEqual(a: unknown, b: unknown): boolean {
  const norm = (addr: unknown) => {
    if (!addr || typeof addr !== "object") return ""
    const o = addr as Record<string, unknown>
    const structured = parseStructuredAddress(addr)
    return [
      o.name,
      o.phone,
      structured.province_code || o.state,
      structured.city || o.city,
      structured.address || o.address_1 || o.address,
      structured.postcode || o.postcode,
    ]
      .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
      .join("|")
  }
  const na = norm(a)
  const nb = norm(b)
  return Boolean(na) && na === nb
}
