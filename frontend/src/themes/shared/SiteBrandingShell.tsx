import type { ReactNode } from "react"

import type { SiteBranding } from "@/kernel/theme-types"
import { cn } from "@/lib/utils"
import { siteFontClass } from "./branding"

type Props = {
  branding: SiteBranding
  children: ReactNode
}

export function SiteBrandingShell({ branding, children }: Props) {
  return (
    <div
      data-accent={branding.accent}
      data-font={branding.font}
      className={cn(
        "flex min-h-svh flex-col bg-background text-foreground",
        siteFontClass(branding.font),
      )}
    >
      {children}
    </div>
  )
}
