import { api } from "@/lib/api"

export type OrderDocumentType =
  | "invoice"
  | "receipt"
  | "label"
  | "packing"
  | "customer_label"
  | "store_label"

export type OrderDocumentsSettings = Record<string, string | boolean | number> & {
  enable_invoice?: boolean
  enable_receipt?: boolean
  enable_label?: boolean
  enable_packing?: boolean
  enable_customer_label?: boolean
  enable_store_label?: boolean
  enable_product_label?: boolean
}

export const ORDER_DOCUMENTS_SETTINGS_PATH = "/api/v1/settings/shop/invoices"

/**
 * Opens the print window before the request (popup blockers reject window.open after an await),
 * then writes the server-rendered document, which prints itself on load.
 * Resolves to false when there was nothing to print.
 */
async function printInWindow(load: () => Promise<{ html: string }>): Promise<boolean> {
  const win = window.open("", "_blank")
  try {
    const { html } = await load()
    if (!html) {
      win?.close()
      return false
    }
    if (!win) throw new Error("popup_blocked")
    win.document.open()
    win.document.write(html)
    win.document.close()
    return true
  } catch (e) {
    win?.close()
    throw e
  }
}

function q(locale: string) {
  return `locale=${encodeURIComponent(locale)}`
}

export function printOrderDocument(orderId: number, type: OrderDocumentType, locale: string) {
  return printInWindow(() => api<{ html: string }>(`/api/v1/orders/${orderId}/print?type=${type}&${q(locale)}`))
}

export function printPendingLabels(locale: string) {
  return printInWindow(() => api<{ count: number; html: string }>(`/api/v1/orders/print-labels?${q(locale)}`))
}

export function printProductLabels(ids: number[], locale: string) {
  return printInWindow(() =>
    api<{ html: string }>(`/api/v1/shop/products/print-labels?ids=${ids.join(",")}&${q(locale)}`)
  )
}
