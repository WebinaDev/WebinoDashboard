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

/**
 * Storefront color scheme comes from the shop's own Theme Settings
 * (appearance.dark_mode_default), never from the dashboard / OS `html.dark`
 * class that next-themes manages for the admin UI. Default: light.
 */
export function storefrontColorScheme(branding: SiteBranding): "light" | "dark" {
  return branding.appearance?.dark_mode_default === true ? "dark" : "light"
}

export function SiteBrandingShell({ branding, children, themeSlug }: Props) {
  const styleCss = storefrontStyleCss(branding, themeSlug)
  const isClassic = themeSlug === "ecommerce-classic"
  return (
    <SiteBrandingProvider branding={branding}>
      <div
        data-accent={branding.accent}
        data-font={branding.font}
        data-theme-slug={themeSlug || undefined}
        data-sf-scheme={isClassic ? storefrontColorScheme(branding) : undefined}
        className={cn(
          "flex min-h-svh flex-col bg-background text-foreground",
          siteFontClass(branding.font),
          storefrontShellClass(themeSlug),
        )}
      >
        {styleCss ? <style dangerouslySetInnerHTML={{ __html: styleCss }} /> : null}
        {children}
        {isClassic ? <ClassicMobileBottomMenu /> : null}
      </div>
    </SiteBrandingProvider>
  )
}
