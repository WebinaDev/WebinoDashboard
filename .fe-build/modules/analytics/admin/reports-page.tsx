"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Legacy `/dashboard/reports` path — send users to shop sales reports. */
export default function ReportsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/reports/sales")
  }, [router])
  return null
}
