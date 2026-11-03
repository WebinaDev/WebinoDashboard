"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { builderGlobalsHref } from "@/lib/page-builder-nav"
import type { ResolvedAdminRoute } from "@/kernel/types"

/** Legacy /dashboard/builder/settings → in-editor globals panel. */
export default function BuilderSettingsRedirect(_props: { route: ResolvedAdminRoute }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(builderGlobalsHref())
  }, [router])
  return <p className="text-muted-foreground p-6 text-sm">…</p>
}
