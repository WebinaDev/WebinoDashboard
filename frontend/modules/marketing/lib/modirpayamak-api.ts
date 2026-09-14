import { api, apiRaw } from "@/lib/api"

export const SMS_FETCH_TIMEOUT_MS = 10_000

export const smsQueryOptions = {
  retry: false as const,
  staleTime: 60_000,
}

async function apiFetch<T>(path: string, init?: RequestInit, _timeout?: number): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase()
  const clean = path.replace(/^\/?/, "")
  const url = clean.startsWith("api/") ? `/${clean}` : `/api/v1/${clean}`
  let json: unknown = undefined
  if (init?.body && typeof init.body === "string") {
    try { json = JSON.parse(init.body) } catch { json = undefined }
  }
  // shop/settings/sms is optional local — map to modirpayamak settings/shop
  const finalUrl = url.replace("/api/v1/shop/settings/sms", "/api/v1/modirpayamak/settings/shop")
  return apiRaw<T>(finalUrl, { method, json, headers: init?.headers as HeadersInit })
}

function smsFetch<T>(path: string, init?: RequestInit) {
  return apiFetch<T>(path, init ?? {}, SMS_FETCH_TIMEOUT_MS)
}

export interface SmsAccount {
  domain: string
  balance: number
  default_from: string
  status: string
  price_per_unit?: number
}

export interface SmsPackage {
  id: number
  name: string
  amount: number
  bonus: number
}

export interface SmsMessage {
  id: number
  domain: string
  sending_type: string
  cost: number
  status: string
  created_at?: string
}

export interface SmsShortcode {
  key: string
  label: string
  scope: string
}

export interface SmsTemplateRow {
  id?: number
  domain?: string
  scope: string
  event_key: string
  body: string
  pattern_code?: string | null
  param_map?: Record<string, string> | null
  enabled?: number | boolean
}

export interface SmsPatternRegistryRow {
  scope: string
  event_key: string
  ippanel_code?: string
  sync_status?: string
  last_error?: string
  param_map?: Record<string, string> | null
}

export interface SmsEventCatalogItem {
  key: string
  label: string
  kind?: 'status' | 'extra' | string
}

export interface SmsRecoveryEventConfig {
  delay_hours?: number
  enabled?: boolean
  type?: 'percent' | 'fixed_cart' | string
  amount?: number
  expires_days?: number
  usage_limit?: number
}

export interface ShopSmsSettings {
  enabled?: boolean
  admin_phones?: string[]
  bot_ids?: number[] | string[]
  sender_line_service?: string
  sender_line_dedicated?: string
  use_service_line?: boolean
  require_pattern?: boolean
  events?: Record<string, { customer: boolean; admin: boolean }>
  event_catalog?: SmsEventCatalogItem[]
  newsletter?: {
    enabled?: boolean
    message_template?: string
    pattern_code?: string
  }
  recovery?: Record<string, SmsRecoveryEventConfig>
}

export interface SiteSmsSettings {
  enabled?: boolean
  sender_line_service?: string
  sender_line_dedicated?: string
  otp_login_enabled?: boolean
  otp_register_enabled?: boolean
  otp_expiry_minutes?: number
  otp_max_attempts?: number
  otp_length?: number
  otp_login_template?: string
  otp_register_template?: string
  use_pattern_for_otp?: boolean
}

export interface SmsAttachedNumber {
  id?: number
  number: string
  role: string
  label?: string
}

export interface ShopSmsPayload {
  provider: string
  unavailable?: boolean
  settings: ShopSmsSettings
  event_keys?: string[]
  event_catalog?: SmsEventCatalogItem[]
  templates?: SmsTemplateRow[]
  shortcodes?: SmsShortcode[]
  registry?: SmsPatternRegistryRow[]
}

export type SmsApiEnvelope = {
  ok?: boolean
  unavailable?: boolean
  message?: string
}

export type SmsDashboardPayload = SmsApiEnvelope & {
  account?: SmsAccount
  messages?: SmsMessage[]
}

export function fetchSmsDashboard() {
  return smsFetch<SmsDashboardPayload>('modirpayamak/dashboard')
}

export function fetchSmsAccount() {
  return smsFetch<SmsApiEnvelope & { account?: SmsAccount }>('modirpayamak/account')
}

export function fetchSmsPackages() {
  return smsFetch<SmsApiEnvelope & { packages?: SmsPackage[] }>('modirpayamak/packages')
}

export function initSmsTopup(packageId: number) {
  return smsFetch<SmsApiEnvelope & { payment_url?: string; order_id?: number }>('modirpayamak/topup/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package_id: packageId }),
  })
}

export function verifySmsTopup(body: { authority?: string; status?: string; order_id?: number }) {
  return apiFetch<{ ok: boolean; credited?: boolean }>('modirpayamak/topup/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function sendSms(body: Record<string, unknown>) {
  return apiFetch<{ ok: boolean; cost?: number }>('modirpayamak/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function sendSmsP2p(body: Record<string, unknown>) {
  return apiFetch<{ ok: boolean }>('modirpayamak/send/peer-to-peer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function calculateSmsPrice(body: Record<string, unknown>) {
  return apiFetch<{
    ok: boolean
    edge?: unknown
    customer_cost?: number
    parts?: number
    line_type?: string
    encoding?: string
    quote?: Record<string, unknown>
  }>('modirpayamak/send/calculate-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function fetchSmsMessages(page = 1) {
  return smsFetch<SmsApiEnvelope & { messages?: SmsMessage[] }>(`modirpayamak/reports/messages?page=${page}`)
}

export function fetchSmsInbox(page = 1, limit = 20) {
  return apiFetch<{ ok: boolean; data?: unknown }>(`modirpayamak/reports/inbox?page=${page}&limit=${limit}`)
}

export function fetchSmsOutbox(page = 1, limit = 20) {
  return apiFetch<{ ok: boolean; data?: unknown }>(`modirpayamak/reports/outbox?page=${page}&limit=${limit}`)
}

export function fetchSmsPatterns(page = 1, perPage = 20) {
  return apiFetch<{ ok: boolean; data?: unknown }>(`modirpayamak/patterns?page=${page}&per_page=${perPage}`)
}

export function fetchSmsPattern(code: string) {
  const c = encodeURIComponent(code.trim())
  return apiFetch<{ ok: boolean; data?: unknown }>(`modirpayamak/patterns/${c}`)
}

export function fetchSmsNumbers() {
  return apiFetch<SmsApiEnvelope & { data?: SmsAttachedNumber[]; numbers?: SmsAttachedNumber[] }>(
    'modirpayamak/numbers',
  )
}

export function createSmsPattern(body: Record<string, unknown>) {
  return apiFetch<{ ok: boolean; data?: unknown; message?: string }>('modirpayamak/patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function syncSmsPattern(body: {
  scope: string
  event_key: string
  pattern_code?: string
  bind_only?: boolean
  param_map?: Record<string, string>
}) {
  return apiFetch<{ ok: boolean; sync_status?: string; ippanel_code?: string; param_map?: Record<string, string> }>(
    'modirpayamak/patterns/sync',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

export function detachSmsPattern(body: { scope: string; event_key: string }) {
  return apiFetch<{ ok: boolean; registry?: unknown }>('modirpayamak/patterns/detach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function notifyOrderSms(body: {
  event_key?: string
  order_id?: number
  order?: Record<string, unknown>
  force_customer?: boolean
  force_admin?: boolean
}) {
  return apiFetch<{ ok: boolean; results?: unknown; skipped?: boolean; reason?: string }>(
    'modirpayamak/orders/notify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

export function fetchSmsPatternRegistry() {
  return apiFetch<{ ok: boolean; registry: unknown[] }>('modirpayamak/patterns/registry')
}

export function fetchSmsPhonebooks() {
  return apiFetch<{ ok: boolean; phonebooks: { id: number; name: string }[] }>('modirpayamak/phonebooks')
}

export function fetchSmsPhonebooksEdge() {
  return apiFetch<{ ok: boolean; data?: unknown }>('modirpayamak/phonebooks/edge')
}

export function createSmsPhonebook(name: string) {
  return apiFetch<{ ok: boolean; id: number }>('modirpayamak/phonebooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function fetchShopSmsSettings() {
  return apiFetch<ShopSmsPayload>('modirpayamak/settings/shop')
}

export function saveShopSmsSettings(payload: {
  settings?: ShopSmsSettings
  templates?: SmsTemplateRow[]
}) {
  return apiFetch('shop/settings/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchSiteSmsSettings() {
  return apiFetch<{ ok: boolean; unavailable?: boolean; settings: SiteSmsSettings }>('modirpayamak/settings/shop')
}

export function saveSiteSmsSettings(settings: SiteSmsSettings) {
  return apiFetch('modirpayamak/settings/shop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  })
}

export function fetchSmsTemplates(scope?: string) {
  const q = scope ? `?scope=${encodeURIComponent(scope)}` : ''
  return apiFetch<{ ok: boolean; templates: SmsTemplateRow[] }>(`modirpayamak/templates${q}`)
}

export function saveSmsTemplates(templates: SmsTemplateRow[]) {
  return apiFetch('modirpayamak/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templates }),
  })
}

export function fetchSmsShortcodes() {
  return apiFetch<{ ok: boolean; shortcodes: SmsShortcode[]; event_keys: string[] }>('modirpayamak/templates/shortcodes')
}

export function fetchNewsletterSubscribers(productId = 0, page = 1) {
  return apiFetch<{ ok: boolean; subscribers: { id: number; phone: string; product_id: number }[] }>(
    `modirpayamak/newsletter/subscribers?product_id=${productId}&page=${page}`
  )
}

export function sendNewsletterCampaign(body: { product_id?: number; message: string; vars?: Record<string, string> }) {
  return apiFetch<{ ok: boolean; sent?: number; total?: number }>('modirpayamak/newsletter/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function unsubscribeNewsletterSubscriber(id: number) {
  return apiFetch<{ ok: boolean }>('modirpayamak/newsletter/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export function sendSiteOtp(body: { phone: string; purpose?: 'login' | 'register' }) {
  return apiFetch<{ ok: boolean }>('modirpayamak/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function testOrderSmsNotify(body: {
  event_key: string
  role?: 'customer' | 'admin'
  phone?: string
  order_id?: number
  order?: Record<string, unknown>
}) {
  return apiFetch<{ ok: boolean; results?: unknown; test?: boolean }>('modirpayamak/orders/test-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function fetchSmsLedger(page = 1, limit = 50) {
  return smsFetch<SmsApiEnvelope & { account?: SmsAccount; ledger?: Array<Record<string, unknown>> }>(
    `modirpayamak/ledger?page=${page}&limit=${limit}`
  )
}

export function fetchSmsBulkStats(outboxId: string) {
  return apiFetch<{ ok: boolean; data?: unknown }>(
    `modirpayamak/reports/bulk-stats?bulk_id=${encodeURIComponent(outboxId)}`
  )
}

export function fetchSmsBulkRecipients(outboxId: string, page = 1) {
  return apiFetch<{ ok: boolean; data?: unknown }>(
    `modirpayamak/reports/bulk-recipients?bulk_id=${encodeURIComponent(outboxId)}&page=${page}`
  )
}

export function cancelScheduledSms(outboxId: string) {
  return apiFetch<{ ok: boolean }>('modirpayamak/send/cancel-scheduled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages_outbox_id: outboxId, outbox_id: outboxId }),
  })
}

export function fetchSmsDrafts(page = 1) {
  return apiFetch<{ ok: boolean; data?: unknown }>(`modirpayamak/drafts?page=${page}`)
}

export function createSmsDraft(body: Record<string, unknown>) {
  return apiFetch<{ ok: boolean; data?: unknown }>('modirpayamak/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function deleteSmsDraft(id: number) {
  return apiFetch<{ ok: boolean }>('modirpayamak/drafts/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export function fetchSmsPhonebookContacts(phonebookId: number) {
  return apiFetch<{ ok: boolean; contacts?: Array<{ id: number; phone: string; name?: string }> }>(
    `modirpayamak/phonebooks/${phonebookId}/contacts`
  )
}

export function createSmsPhonebookContact(phonebookId: number, body: { phone: string; name?: string }) {
  return apiFetch<{ ok: boolean }>('modirpayamak/phonebooks/' + phonebookId + '/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function fetchSmsSecretaries() {
  return apiFetch<{ ok: boolean; secretaries?: Array<Record<string, unknown>> }>('modirpayamak/secretaries')
}

export function saveSmsSecretary(body: Record<string, unknown>) {
  return apiFetch<{ ok: boolean; rule?: Record<string, unknown> }>('modirpayamak/secretaries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function deleteSmsSecretary(id: number) {
  return apiFetch<{ ok: boolean }>('modirpayamak/secretaries/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export function processSmsSecretaries() {
  return apiFetch<{ ok: boolean; processed?: number; matched?: number }>('modirpayamak/secretaries/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}
