export const ACCENT_PRESETS = [
  "zinc",
  "slate",
  "blue",
  "green",
  "rose",
  "orange",
] as const

export type AccentPreset = (typeof ACCENT_PRESETS)[number]

export function normalizeAccent(accent?: string | null): AccentPreset {
  if (!accent || accent === "default" || accent === "zinc") return "zinc"
  if (accent === "amber" || accent === "yellow" || accent === "red") return "orange"
  if (accent === "violet") return "blue"
  if ((ACCENT_PRESETS as readonly string[]).includes(accent)) return accent as AccentPreset
  return "zinc"
}

export function applyAccent(accent: AccentPreset): void {
  if (typeof document === "undefined") return
  document.documentElement.dataset.accent = accent
}

export function readStoredAccent(storageKey = "theme_accent"): AccentPreset {
  if (typeof window === "undefined") return "zinc"
  return normalizeAccent(localStorage.getItem(storageKey))
}

export function persistAccent(accent: AccentPreset, storageKey = "theme_accent"): void {
  if (typeof window === "undefined") return
  localStorage.setItem(storageKey, accent)
  applyAccent(accent)
}
