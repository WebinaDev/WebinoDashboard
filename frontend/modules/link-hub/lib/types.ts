export type LinkHubBlockType = "link" | "contact" | "form" | "faq" | "event"

export type LinkHubBlock = {
  id?: number
  type: LinkHubBlockType
  sort: number
  is_visible: boolean
  payload: Record<string, unknown>
}

export type LinkHubProfile = {
  id: number
  kind: "business" | "member"
  slug: string | null
  title: string | null
  avatar_url: string | null
  bio: string | null
  is_published: boolean
  theme_json?: Record<string, unknown> | null
  blocks?: LinkHubBlock[]
  blocks_count?: number
}

export type LinkHubStats = {
  views: number
  visitors: number
  clicks: number
  ctr: number
  days: number
}

export type LinkHubOverview = {
  business: LinkHubProfile
  member_count: number
  public_url: string | null
  member_url_template: string | null
  alias_subdomain: string
  alias_hostname: string | null
  primary_domain: string | null
  dns_hint: string | null
  stats?: LinkHubStats
}

export function emptyBlock(type: LinkHubBlockType, sort = 0): LinkHubBlock {
  const payloads: Record<LinkHubBlockType, Record<string, unknown>> = {
    link: { label: "لینک جدید", url: "https://", icon: "link" },
    contact: {
      phone: "",
      email: "",
      socials: [] as Array<{ label: string; url: string }>,
    },
    form: {
      title: "درخواست مشاوره",
      submit_label: "ارسال",
      fields: [
        { name: "name", label: "نام", type: "text", required: true },
        { name: "phone", label: "موبایل", type: "tel", required: true },
        { name: "message", label: "پیام", type: "textarea", required: false },
      ],
    },
    faq: {
      title: "سوالات متداول",
      items: [
        { q: "سوال نمونه؟", a: "پاسخ نمونه." },
      ],
    },
    event: {
      title: "رویداد",
      datetime: "",
      cta_label: "جزئیات",
      cta_url: "",
    },
  }
  return { type, sort, is_visible: true, payload: payloads[type] }
}
