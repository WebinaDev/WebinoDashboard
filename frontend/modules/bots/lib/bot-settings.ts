import type { LiveBotProvider } from "./platforms"

export type BotMeta = {
  addons?: Record<string, boolean>
  cascade?: Record<string, unknown>
  widget?: Record<string, unknown>
  admin_chat_ids?: string | string[]
  faq?: Array<{ q: string; a: string; keywords?: string }>
  templates?: Record<string, string>
  channel?: Record<string, unknown>
  club?: Record<string, unknown>
  connection?: {
    mode?: "webhook" | "polling"
    proxy_url?: string
    mirror_token?: string
    sandbox?: boolean
    sandbox_token?: string
  }
  force_join?: Record<string, unknown>
  referral?: Record<string, unknown>
  notifications?: Record<string, unknown>
  page_builder?: Record<string, unknown>
  texts?: Record<string, string>
  bot_username?: string
  [key: string]: unknown
}

export type BotSettings = {
  provider: string
  enabled: boolean
  token: string
  has_token: boolean
  has_webhook_secret?: boolean
  webhook_url?: string
  webhook_secret_header?: string
  meta?: BotMeta
}

export type BotConnectionStatus = {
  ok: boolean
  bot?: { id?: number; username?: string; first_name?: string }
  webhook?: { url?: string; pending_update_count?: number; last_error_message?: string }
  error?: string
  mode?: string
}

export type BotDashboardStats = {
  sessions_total: number
  sessions_24h: number
  logs_24h: number
  logs_failed_24h: number
  outbox_dead: number
  channel_posts: number
  campaigns_running: number
  broadcast_active: boolean
  enabled: boolean
  has_token: boolean
  bot_username?: string | null
}

export const ADDON_KEYS = [
  "card_to_card",
  "faq",
  "tickets",
  "loyalty",
  "channel_publish",
  "order_cascade",
  "site_widget",
  "webapp",
  "force_join",
  "referral",
] as const

export const TEMPLATE_KEYS = [
  "welcome",
  "order_created",
  "paid",
  "cart_empty",
  "ask_contact",
  "ask_address",
  "unknown",
] as const

export function settingsPath(provider: LiveBotProvider): string {
  return `/api/v1/bots/${provider}/settings`
}

export function asAdminIds(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ")
  return String(value ?? "")
}

export function parseAdminIds(raw: string): string[] {
  return raw
    .split(/[,،\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
