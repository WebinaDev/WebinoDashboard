export const ACCENT_PRESETS = [
    "zinc",
    "slate",
    "blue",
    "green",
    "rose",
    "orange",
];
export function normalizeAccent(accent) {
    if (!accent || accent === "default" || accent === "zinc")
        return "zinc";
    if (accent === "amber" || accent === "yellow" || accent === "red")
        return "orange";
    if (accent === "violet")
        return "blue";
    if (ACCENT_PRESETS.includes(accent))
        return accent;
    return "zinc";
}
export function applyAccent(accent) {
    if (typeof document === "undefined")
        return;
    document.documentElement.dataset.accent = accent;
}
export function readStoredAccent(storageKey = "theme_accent") {
    if (typeof window === "undefined")
        return "zinc";
    return normalizeAccent(localStorage.getItem(storageKey));
}
export function persistAccent(accent, storageKey = "theme_accent") {
    if (typeof window === "undefined")
        return;
    localStorage.setItem(storageKey, accent);
    applyAccent(accent);
}
