import type { ReactNode } from "react"

import type { SiteBranding } from "@/kernel/theme-types"
import { cn } from "@/lib/utils"
import { siteFontClass, storefrontStyleCss } from "./branding"
import { SiteBrandingProvider } from "./site-branding-context"
import { storefrontShellClass } from "./storefront-skin"
import { ClassicMobileBottomMenu } from "@/themes/ecommerce-classic/components/ClassicMobileBottomMenu"

type Props = {
  branding: SiteBranding
  children: ReactNode
  themeSlug?: string | null
}

export function SiteBrandingShell({ branding, children, themeSlug }: Props) {
  const styleCss = storefrontStyleCss(branding, themeSlug)
  return (
    <SiteBrandingProvider branding={branding}>
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
        {styleCss ? <style dangerouslySetInnerHTML={{ __html: styleCss }} /> : null}
        {children}
        {themeSlug === "ecommerce-classic" ? <ClassicMobileBottomMenu /> : null}
      </div>
    </SiteBrandingProvider>
  )
}
