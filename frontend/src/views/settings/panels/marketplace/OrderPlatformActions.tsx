"use client"

import { BasalamOrderActions } from "@/views/settings/panels/marketplace/BasalamOrderActions"
import { DigikalaOrderActions } from "@/views/settings/panels/marketplace/DigikalaOrderActions"

export type OrderPlatformActionsProps = {
  platform: string
  orderId: number
  remoteOrderId: string | null
  meta: Record<string, unknown>
}

export function OrderPlatformActions(props: OrderPlatformActionsProps) {
  switch (props.platform) {
    case "basalam":
      return <BasalamOrderActions orderId={props.orderId} />
    case "digikala":
      return <DigikalaOrderActions orderId={props.orderId} />
    default:
      return null
  }
}
