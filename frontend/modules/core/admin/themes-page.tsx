"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import type { ResolvedAdminRoute } from "@/kernel/types"

/** Legacy /dashboard/themes → settings templates gallery. */
export default function ThemesPage(_props: { route: ResolvedAdminRoute }) {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/settings/site/templates")
  }, [router])
  return null
}
