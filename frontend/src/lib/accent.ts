export const ACCENT_PRESETS = [
  'colorful',
  'default',
  'red',
  'rose',
  'orange',
  'green',
  'blue',
  'yellow',
  'violet',
  'cafe',
  'cosmetics',
  'mobile',
  'electronics',
] as const

export type AccentPreset = (typeof ACCENT_PRESETS)[number]

/** Business-themed accents with patterns + glass surfaces. */
export const BUSINESS_ACCENTS = ['cafe', 'cosmetics', 'mobile', 'electronics'] as const

export type BusinessAccent = (typeof BUSINESS_ACCENTS)[number]

export function isBusinessAccent(accent: string): accent is BusinessAccent {
  return (BUSINESS_ACCENTS as readonly string[]).includes(accent)
}

export const ACCENT_MENU_ITEMS = [
  { value: 'colorful', labelKey: 'settings.accentColorful' },
  { value: 'default', labelKey: 'settings.accentDefault' },
  { value: 'red', labelKey: 'settings.accentRed' },
  { value: 'rose', labelKey: 'settings.accentRose' },
  { value: 'orange', labelKey: 'settings.accentOrange' },
  { value: 'green', labelKey: 'settings.accentGreen' },
  { value: 'blue', labelKey: 'settings.accentBlue' },
  { value: 'yellow', labelKey: 'settings.accentYellow' },
  { value: 'violet', labelKey: 'settings.accentViolet' },
  { value: 'cafe', labelKey: 'settings.accentCafe' },
  { value: 'cosmetics', labelKey: 'settings.accentCosmetics' },
  { value: 'mobile', labelKey: 'settings.accentMobile' },
  { value: 'electronics', labelKey: 'settings.accentElectronics' },
] as const satisfies ReadonlyArray<{ value: AccentPreset; labelKey: string }>

/** Light-mode preview swatches (matches index.css accent presets). Solid or CSS gradient. */
export const ACCENT_SWATCH: Record<AccentPreset, string> = {
  colorful: 'oklch(52% 0.14 195)',
  default: 'oklch(20.5% 0 0)',
  red: 'oklch(57% 0.22 27)',
  rose: 'oklch(52% 0.2 12)',
  orange: 'oklch(65% 0.2 45)',
  green: 'oklch(48% 0.16 155)',
  blue: 'oklch(52% 0.2 252)',
  yellow: 'oklch(75% 0.15 85)',
  violet: 'oklch(48% 0.22 292)',
  cafe: 'linear-gradient(135deg, oklch(42% 0.08 55) 0%, oklch(72% 0.1 75) 100%)',
  cosmetics: 'linear-gradient(135deg, oklch(58% 0.18 350) 0%, oklch(82% 0.08 85) 100%)',
  mobile: 'linear-gradient(135deg, oklch(62% 0.18 50) 0%, oklch(55% 0.06 250) 100%)',
  electronics: 'linear-gradient(135deg, oklch(78% 0.16 95) 0%, oklch(52% 0.14 250) 100%)',
}

/** Maps legacy stored values to the current accent palette. Empty → colorful. */
export function normalizeAccent(accent?: string | null): AccentPreset {
  if (!accent) {
    return 'colorful'
  }
  if (accent === 'amber') {
    return 'orange'
  }
  if (accent === 'zinc' || accent === 'slate') {
    return 'default'
  }
  if ((ACCENT_PRESETS as readonly string[]).includes(accent)) {
    return accent as AccentPreset
  }
  return 'colorful'
}
