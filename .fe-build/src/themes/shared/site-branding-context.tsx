"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { ClassicThemeSettings, SiteBranding } from "@/kernel/theme-types"
import { DEFAULT_SITE_BRANDING } from "./branding"

const BrandingCtx = createContext<SiteBranding>(DEFAULT_SITE_BRANDING)

export function SiteBrandingProvider({
  branding,
  children,
}: {
  branding: SiteBranding
  children: ReactNode
}) {
  return <BrandingCtx.Provider value={branding}>{children}</BrandingCtx.Provider>
}

export function useSiteBranding(): SiteBranding {
  return useContext(BrandingCtx)
}

export function useClassicThemeSettings(): ClassicThemeSettings {
  return useContext(BrandingCtx).appearance ?? {}
}
