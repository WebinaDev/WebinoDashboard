"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Legacy parallel reports page — redirect to analytics shop reports. */
export default function CommerceReportsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/reports/sales")
  }, [router])
  return null
}
