export const ACCENT_PRESETS = [
    "colorful",
    "default",
    "red",
    "rose",
    "orange",
    "green",
    "blue",
    "yellow",
    "violet",
    "cafe",
    "cosmetics",
    "mobile",
    "electronics",
];
/** Business-themed accents with patterns + glass surfaces. */
export const BUSINESS_ACCENTS = ["cafe", "cosmetics", "mobile", "electronics"];
export function isBusinessAccent(accent) {
    return BUSINESS_ACCENTS.includes(accent);
}
export const ACCENT_MENU_ITEMS = [
    { value: "colorful", labelKey: "settings.accentColorful" },
    { value: "default", labelKey: "settings.accentDefault" },
    { value: "red", labelKey: "settings.accentRed" },
    { value: "rose", labelKey: "settings.accentRose" },
    { value: "orange", labelKey: "settings.accentOrange" },
    { value: "green", labelKey: "settings.accentGreen" },
    { value: "blue", labelKey: "settings.accentBlue" },
    { value: "yellow", labelKey: "settings.accentYellow" },
    { value: "violet", labelKey: "settings.accentViolet" },
    { value: "cafe", labelKey: "settings.accentCafe" },
    { value: "cosmetics", labelKey: "settings.accentCosmetics" },
    { value: "mobile", labelKey: "settings.accentMobile" },
    { value: "electronics", labelKey: "settings.accentElectronics" },
];
/** Light-mode preview swatches (matches themes.css accent presets). Solid or CSS gradient. */
export const ACCENT_SWATCH = {
    colorful: "oklch(52% 0.14 195)",
    default: "oklch(20.5% 0 0)",
    red: "oklch(57% 0.22 27)",
    rose: "oklch(52% 0.2 12)",
    orange: "oklch(65% 0.2 45)",
    green: "oklch(48% 0.16 155)",
    blue: "oklch(52% 0.2 252)",
    yellow: "oklch(75% 0.15 85)",
    violet: "oklch(48% 0.22 292)",
    cafe: "linear-gradient(135deg, oklch(42% 0.08 55) 0%, oklch(72% 0.1 75) 100%)",
    cosmetics: "linear-gradient(135deg, oklch(58% 0.18 350) 0%, oklch(82% 0.08 85) 100%)",
    mobile: "linear-gradient(135deg, oklch(62% 0.18 50) 0%, oklch(55% 0.06 250) 100%)",
    electronics: "linear-gradient(135deg, oklch(78% 0.16 95) 0%, oklch(52% 0.14 250) 100%)",
};
/** Maps legacy stored values to the current accent palette. Empty → colorful. */
export function normalizeAccent(accent) {
    if (!accent)
        return "colorful";
    if (accent === "amber")
        return "orange";
    if (accent === "zinc" || accent === "slate")
        return "default";
    if (ACCENT_PRESETS.includes(accent)) {
        return accent;
    }
    return "colorful";
}
export function applyAccent(accent) {
    if (typeof document === "undefined")
        return;
    document.documentElement.dataset.accent = accent;
}
export function readStoredAccent(storageKey = "theme_accent") {
    if (typeof window === "undefined")
        return "colorful";
    return normalizeAccent(localStorage.getItem(storageKey));
}
export function persistAccent(accent, storageKey = "theme_accent") {
    if (typeof window === "undefined")
        return;
    localStorage.setItem(storageKey, accent);
    applyAccent(accent);
}
