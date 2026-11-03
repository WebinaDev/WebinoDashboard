"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { builderThemeSettingsHref } from "@/lib/page-builder-nav"
import type { ResolvedAdminRoute } from "@/kernel/types"

/** Legacy /dashboard/theme-builder → site settings theme section. */
export default function ThemeBuilderRedirect(_props: { route: ResolvedAdminRoute }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(builderThemeSettingsHref())
  }, [router])
  return <p className="text-muted-foreground p-6 text-sm">…</p>
}
