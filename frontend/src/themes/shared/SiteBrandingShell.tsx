import type { ReactNode } from "react"

import type { SiteBranding } from "@/kernel/theme-types"
import { cn } from "@/lib/utils"
import { siteFontClass } from "./branding"
import { storefrontShellClass } from "./storefront-skin"

type Props = {
  branding: SiteBranding
  children: ReactNode
  themeSlug?: string | null
}

export function SiteBrandingShell({ branding, children, themeSlug }: Props) {
  return (
    <div
      data-accent={branding.accent}
      data-font={branding.font}
      data-theme-slug={themeSlug || undefined}
      className={cn(
        "flex min-h-svh flex-col bg-background text-foreground",
        siteFontClass(branding.font),
        storefrontShellClass(themeSlug),
      )}
    >
      {children}
    </div>
  )
}
