"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Legacy stub — academy admin route is `/dashboard/academy`. */
export function AcademyAdminPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/academy")
  }, [router])
  return null
}
