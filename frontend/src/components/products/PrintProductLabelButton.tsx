"use client"

import { Tag } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { useOrderDocumentsSettings } from "@/components/orders/OrderPrintActions"
import { Button } from "@/components/ui/button"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { printProductLabels } from "@/lib/order-print"

export function PrintProductLabelButton({ productIds }: { productIds: number[] }) {
  const t = useTranslations("store")
  const tPrint = useTranslations("orders_print")
  const locale = useLocale()
  const docs = useOrderDocumentsSettings()
  const [busy, setBusy] = useState(false)

  if (docs.data?.enable_product_label === false || productIds.length === 0) return null

  async function run() {
    setBusy(true)
    try {
      await printProductLabels(productIds, locale)
    } catch (e) {
      const message =
        e instanceof Error && e.message === "popup_blocked" ? tPrint("popup_blocked") : getApiErrorMessage(e as Error)
      toast.error(message || tPrint("failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>
      <Tag className="size-4" aria-hidden />
      {t("print_product_label")}
    </Button>
  )
}
