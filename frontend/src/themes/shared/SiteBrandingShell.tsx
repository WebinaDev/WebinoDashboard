import type { ReactNode } from "react"

import type { SiteBranding } from "@/kernel/theme-types"
import { cn } from "@/lib/utils"

type Props = {
  branding: SiteBranding
  children: ReactNode
}

export function SiteBrandingShell({ branding, children }: Props) {
  return (
    <div
      data-accent={branding.accent}
      className={cn(
        "flex min-h-svh flex-col bg-background text-foreground",
        branding.font === "system" ? "font-sans" : undefined,
      )}
    >
      {children}
    </div>
  )
}
