"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Legacy stub — real blog admin lives under `/dashboard/blog`. */
export function BlogAdminPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/blog")
  }, [router])
  return null
}
