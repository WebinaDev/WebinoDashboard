"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Legacy stub — real magazine admin lives under `/dashboard/magazine`. */
export function MagazineAdminPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/magazine")
  }, [router])
  return null
}
