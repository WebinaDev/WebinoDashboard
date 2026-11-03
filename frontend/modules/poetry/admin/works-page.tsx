"use client"

import { useLocale, useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"

/** Placeholder admin surface — module is entitlement-gated and ERP opt-in only. */
export default function PoetryWorksPage({ route: _route }: { route: ResolvedAdminRoute }) {
  const tNav = useTranslations("nav")
  const locale = useLocale()
  const fa = locale === "fa"
  const hint = fa
    ? "این ماژول فقط با انتخاب صریح در ERP فعال می‌شود."
    : "This module is enabled only when explicitly selected in ERP."
  const empty = fa ? "هنوز محتوایی ثبت نشده است." : "No works yet."

  return (
    <PageShell title={tNav("poetry")} description={hint}>
      <p className="text-muted-foreground text-sm">{empty}</p>
    </PageShell>
  )
}
