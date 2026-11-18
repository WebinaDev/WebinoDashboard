"use client"

import { BasalamProductFields } from "@/views/settings/panels/marketplace/BasalamProductFields"
import { DigikalaDkpPicker } from "@/views/settings/panels/marketplace/DigikalaDkpPicker"

export type ProductExtrasProps = {
  platform: string
  productId: string
  variantId: number | null
  map: { id: number | null; remote_product_id: string | null; meta: Record<string, unknown> | null }
  onMetaChange: (meta: Record<string, unknown>) => void
}

export function ProductPlatformExtras(props: ProductExtrasProps) {
  switch (props.platform) {
    case "basalam":
      return <BasalamProductFields productId={props.productId} variantId={props.variantId} />
    case "digikala":
      return <DigikalaDkpPicker productId={props.productId} variantId={props.variantId} currentDkp={props.map.remote_product_id} />
    default:
      return null
  }
}
