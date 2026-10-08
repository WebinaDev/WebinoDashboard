import type { SiteChromeProps } from "@/themes/shared/types"

import { CafeSkinFooter, CafeSkinHeader } from "../cafe-starter/components/SkinChrome"

export function SiteHeader(props: SiteChromeProps) {
  return <CafeSkinHeader {...props} skin="cafe-menew" />
}

export function SiteFooter({ siteName }: { siteName: string }) {
  return <CafeSkinFooter siteName={siteName} skin="cafe-menew" />
}

export const themeSlug = "cafe-menew"
