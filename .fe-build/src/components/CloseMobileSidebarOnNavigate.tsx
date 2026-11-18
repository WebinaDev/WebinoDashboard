"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

import { useSidebar } from "@/components/ui/sidebar"

/** Closes the mobile sheet after every dashboard navigation. */
export function CloseMobileSidebarOnNavigate() {
  const pathname = usePathname()
  const { setOpenMobile, isMobile } = useSidebar()

  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [pathname, isMobile, setOpenMobile])

  return null
}
