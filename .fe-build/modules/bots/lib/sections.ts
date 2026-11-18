import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Bell,
  Cable,
  Gift,
  LayoutDashboard,
  LayoutTemplate,
  LineChart,
  Megaphone,
  MessageSquareText,
  Radio,
  ScrollText,
  Settings2,
  Shield,
  Ticket,
  ToggleLeft,
  KeyRound,
} from "lucide-react"

export const BOT_SECTIONS = [
  { id: "overview", icon: LayoutDashboard, group: "primary" },
  { id: "connection", icon: Cable, group: "primary" },
  { id: "tokens", icon: KeyRound, group: "primary" },
  { id: "admins", icon: Shield, group: "primary" },
  { id: "features", icon: ToggleLeft, group: "primary" },
  { id: "texts", icon: MessageSquareText, group: "primary" },
  { id: "diagnostics", icon: Activity, group: "primary" },
  { id: "broadcast", icon: Megaphone, group: "engage" },
  { id: "campaigns", icon: Radio, group: "engage" },
  { id: "notifications", icon: Bell, group: "engage" },
  { id: "referral", icon: Gift, group: "engage" },
  { id: "page-builder", icon: LayoutTemplate, group: "engage" },
  { id: "reports", icon: LineChart, group: "ops" },
  { id: "logs", icon: ScrollText, group: "ops" },
  { id: "coupons", icon: Ticket, group: "ops" },
] as const

export type BotSectionId = (typeof BOT_SECTIONS)[number]["id"]

export const BOT_SECTION_GROUPS = [
  { id: "primary", labelKey: "navGroups.primary" },
  { id: "engage", labelKey: "navGroups.engage" },
  { id: "ops", labelKey: "navGroups.ops" },
] as const

export function parseBotRoutePath(path: string): { platform: string; section: BotSectionId } | null {
  const parts = path.split("/").filter(Boolean)
  if (parts[0] !== "bots" || !parts[1]) return null
  const platform = parts[1]
  const raw = parts[2] ?? "overview"
  const section = (BOT_SECTIONS.some((s) => s.id === raw) ? raw : "overview") as BotSectionId
  return { platform, section }
}

export function botSectionHref(platform: string, section: BotSectionId): string {
  if (section === "overview") return `bots/${platform}`
  return `bots/${platform}/${section}`
}

export type BotSectionDef = {
  id: BotSectionId
  icon: LucideIcon
  group: string
}
