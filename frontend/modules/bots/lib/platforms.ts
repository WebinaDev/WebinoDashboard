export const LIVE_BOT_PROVIDERS = ["bale", "telegram"] as const
export type LiveBotProvider = (typeof LIVE_BOT_PROVIDERS)[number]

export const BOT_PLATFORMS = [
  { id: "bale", live: true },
  { id: "telegram", live: true },
  { id: "eitaa", live: false },
  { id: "rubika", live: false },
  { id: "email", live: false },
  { id: "twitter", live: false },
  { id: "instagram", live: false },
  { id: "whatsapp", live: false },
] as const

export type BotPlatformId = (typeof BOT_PLATFORMS)[number]["id"]
export type BotProvider = LiveBotProvider

export function isLiveBotProvider(id: string): id is LiveBotProvider {
  return (LIVE_BOT_PROVIDERS as readonly string[]).includes(id)
}

export function platformLabelKey(id: string): string {
  return `platforms.${id}`
}
