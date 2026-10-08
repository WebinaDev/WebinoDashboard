import type { SiteChromeProps } from "@/themes/shared/types"

import { CafeSkinFooter, CafeSkinHeader } from "./components/SkinChrome"

/** cafe-starter renders the Reyhoon skin. */
export function SiteHeader(props: SiteChromeProps) {
  return <CafeSkinHeader {...props} skin="cafe-reyhoon" />
}

export function SiteFooter({ siteName }: { siteName: string }) {
  return <CafeSkinFooter siteName={siteName} skin="cafe-reyhoon" />
}

export const themeSlug = "cafe-starter"
