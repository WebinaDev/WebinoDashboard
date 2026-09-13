import { api } from "@/lib/api"

export const smsQueryOptions = { retry: false as const, staleTime: 60_000 }

function path(p: string) {
  return `/api/v1/modirpayamak/${p.replace(/^\/?modirpayamak\/?/, "")}`
}

export async function smsGet<T>(p: string, query?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams()
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") qs.set(k, String(v))
    }
  }
  const q = qs.toString()
  return api<T>(`${path(p)}${q ? `?${q}` : ""}`)
}

export async function smsPost<T>(p: string, body?: Record<string, unknown>) {
  return api<T>(path(p), { method: "POST", json: body ?? {} })
}

export const fetchSmsDashboard = () => smsGet<Record<string, unknown>>("dashboard")
export const fetchSmsAccount = () => smsGet<Record<string, unknown>>("account")
export const fetchSmsPackages = () => smsGet<Record<string, unknown>>("packages")
export const fetchSmsMessages = (page = 1) => smsGet<Record<string, unknown>>("reports/messages", { page })
export const fetchSmsInbox = (page = 1) => smsGet<Record<string, unknown>>("reports/inbox", { page, limit: 20 })
export const fetchSmsOutbox = (page = 1) => smsGet<Record<string, unknown>>("reports/outbox", { page, limit: 20 })
export const fetchSmsPatterns = (page = 1) => smsGet<Record<string, unknown>>("patterns", { page, per_page: 20 })
export const fetchSmsNumbers = () => smsGet<Record<string, unknown>>("numbers")
export const fetchSmsPhonebooks = () => smsGet<Record<string, unknown>>("phonebooks")
export const fetchSmsDrafts = (page = 1) => smsGet<Record<string, unknown>>("drafts", { page })
export const fetchSmsLedger = (page = 1) => smsGet<Record<string, unknown>>("ledger", { page, limit: 20 })
export const fetchSmsSecretaries = () => smsGet<Record<string, unknown>>("secretaries")
export const fetchSmsPatternRegistry = () => smsGet<Record<string, unknown>>("patterns/registry")
export const fetchNewsletterSubscribers = (productId = 0, page = 1) =>
  smsGet<Record<string, unknown>>("newsletter/subscribers", { product_id: productId, page })
export const fetchSmsBulkStats = (bulkId: string) => smsGet<Record<string, unknown>>("reports/bulk-stats", { bulk_id: bulkId })
export const fetchSmsBulkRecipients = (bulkId: string, page = 1) =>
  smsGet<Record<string, unknown>>("reports/bulk-recipients", { bulk_id: bulkId, page })

export const initSmsTopup = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("topup/init", body)
export const verifySmsTopup = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("topup/verify", body)
export const sendSms = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("send", body)
export const createSmsDraft = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("drafts", body)
export const deleteSmsDraft = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("drafts/delete", body)
export const cancelScheduledSms = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("send/cancel-scheduled", body)
export const createSmsPhonebook = (name: string) => smsPost<Record<string, unknown>>("phonebooks", { name })
export const saveSmsSecretary = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("secretaries", body)
export const deleteSmsSecretary = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("secretaries/delete", body)
export const sendNewsletterCampaign = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("newsletter/send", body)
export const createSmsPattern = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("patterns", body)
export const syncSmsPattern = (body: Record<string, unknown>) => smsPost<Record<string, unknown>>("patterns/sync", body)
