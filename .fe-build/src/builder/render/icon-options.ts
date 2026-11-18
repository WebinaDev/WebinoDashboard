/** Icon choices shared by builder widgets (keys map to lucide icons in extra-widgets.tsx). */
import { DEFAULT_ICON_OPTIONS } from "@webina/ui/builder"

/** Extra contact/social icons for About/Contact pages (mail, location aliases, messengers). */
const EXTRA_ICON_OPTIONS = [
  { value: "mail", label: "ایمیل" },
  { value: "location", label: "موقعیت" },
  { value: "instagram", label: "اینستاگرام" },
  { value: "whatsapp", label: "واتساپ" },
  { value: "telegram", label: "تلگرام" },
]

const seen = new Set(DEFAULT_ICON_OPTIONS.map((o) => o.value))
export const ICON_OPTIONS = [
  ...DEFAULT_ICON_OPTIONS,
  ...EXTRA_ICON_OPTIONS.filter((o) => !seen.has(o.value)),
]
