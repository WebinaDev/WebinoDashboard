"use client"

import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Printer, Tags } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  ORDER_DOCUMENTS_SETTINGS_PATH,
  printOrderDocument,
  printPendingLabels,
  type OrderDocumentType,
  type OrderDocumentsSettings,
} from "@/lib/order-print"

export function useOrderDocumentsSettings() {
  return useQuery({
    queryKey: ["tenant-settings", "shop", "invoices", ""],
    queryFn: () => api<OrderDocumentsSettings>(ORDER_DOCUMENTS_SETTINGS_PATH),
    staleTime: 60_000,
  })
}

function usePrintErrors() {
  const t = useTranslations("orders_print")
  return (e: unknown) => {
    const message = e instanceof Error && e.message === "popup_blocked" ? t("popup_blocked") : getApiErrorMessage(e as Error)
    toast.error(message || t("failed"))
  }
}

const PRIMARY: OrderDocumentType[] = ["invoice", "label", "receipt"]
const SECONDARY: OrderDocumentType[] = ["packing", "customer_label", "store_label"]

export function OrderPrintActions({ orderId }: { orderId: number | string }) {
  const t = useTranslations("orders_print")
  const locale = useLocale()
  const docs = useOrderDocumentsSettings()
  const onError = usePrintErrors()
  const [busy, setBusy] = useState<OrderDocumentType | null>(null)

  const enabled = (type: OrderDocumentType) => docs.data?.[`enable_${type}`] !== false
  const primary = PRIMARY.filter(enabled)
  const secondary = SECONDARY.filter(enabled)

  async function print(type: OrderDocumentType) {
    setBusy(type)
    try {
      await printOrderDocument(Number(orderId), type, locale)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(null)
    }
  }

  if (!primary.length && !secondary.length) return null

  return (
    <>
      {primary.map((type) => (
        <Button key={type} type="button" variant="outline" disabled={busy !== null} onClick={() => void print(type)}>
          <Printer className="size-4" aria-hidden />
          {t(type)}
        </Button>
      ))}
      {secondary.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" disabled={busy !== null}>
              <Printer className="size-4" aria-hidden />
              {t("more")}
              <ChevronDown className="size-3.5 opacity-70" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {secondary.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => void print(type)}>
                {t(type)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}

export function PrintPendingLabelsButton() {
  const t = useTranslations("orders_print")
  const locale = useLocale()
  const docs = useOrderDocumentsSettings()
  const onError = usePrintErrors()
  const [busy, setBusy] = useState(false)

  if (docs.data?.enable_label === false) return null

  async function run() {
    setBusy(true)
    try {
      const printed = await printPendingLabels(locale)
      if (!printed) toast.info(t("no_pending_labels"))
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>
      <Tags className="size-4" aria-hidden />
      {t("pending_labels")}
    </Button>
  )
}
