"use client"

import { resolveCafeSkin } from "../skin"
import type { CafeVenuePayload, CatalogPayload } from "../types"
import "../menu.css"
import { KeraseCatalogue } from "../skins/kerase/Catalogue"
import { MashCatalogue } from "../skins/mash-donald/Catalogue"
import { MenewCatalogue } from "../skins/menew/Catalogue"
import { ReyhoonCatalogue } from "../skins/reyhoon/Catalogue"
import { SignatureCatalogue } from "../skins/signature/Catalogue"
import { SuperCatalogue } from "../skins/super/Catalogue"

type Props = {
  catalog: CatalogPayload
  venue: CafeVenuePayload | null
  initialQuery?: string
  tableNumber?: string | null
  branchSlug?: string | null
  menuSlug?: string | null
  activeThemeSlug?: string | null
}

/**
 * Each cafe skin owns its own composition (hero, navigation, cards, sheet placement, chrome).
 * Data, cart, modifiers, table QR, search and ordering live in the shared controller.
 */
export function CatalogueView(props: Props) {
  const skin = resolveCafeSkin(props.activeThemeSlug ?? props.venue?.tenant.active_theme_slug)
  switch (skin) {
    case "cafe-mash-donald":
      return <MashCatalogue {...props} />
    case "cafe-kerase":
      return <KeraseCatalogue {...props} />
    case "cafe-super":
      return <SuperCatalogue {...props} />
    case "cafe-menew":
      return <MenewCatalogue {...props} />
    case "cafe-signature":
      return <SignatureCatalogue {...props} />
    default:
      return <ReyhoonCatalogue {...props} />
  }
}
