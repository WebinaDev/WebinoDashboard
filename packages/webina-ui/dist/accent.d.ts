export declare const ACCENT_PRESETS: readonly ["colorful", "default", "red", "rose", "orange", "green", "blue", "yellow", "violet", "cafe", "cosmetics", "mobile", "electronics"];
export type AccentPreset = (typeof ACCENT_PRESETS)[number];
/** Business-themed accents with patterns + glass surfaces. */
export declare const BUSINESS_ACCENTS: readonly ["cafe", "cosmetics", "mobile", "electronics"];
export type BusinessAccent = (typeof BUSINESS_ACCENTS)[number];
export declare function isBusinessAccent(accent: string): accent is BusinessAccent;
export declare const ACCENT_MENU_ITEMS: readonly [{
    readonly value: "colorful";
    readonly labelKey: "settings.accentColorful";
}, {
    readonly value: "default";
    readonly labelKey: "settings.accentDefault";
}, {
    readonly value: "red";
    readonly labelKey: "settings.accentRed";
}, {
    readonly value: "rose";
    readonly labelKey: "settings.accentRose";
}, {
    readonly value: "orange";
    readonly labelKey: "settings.accentOrange";
}, {
    readonly value: "green";
    readonly labelKey: "settings.accentGreen";
}, {
    readonly value: "blue";
    readonly labelKey: "settings.accentBlue";
}, {
    readonly value: "yellow";
    readonly labelKey: "settings.accentYellow";
}, {
    readonly value: "violet";
    readonly labelKey: "settings.accentViolet";
}, {
    readonly value: "cafe";
    readonly labelKey: "settings.accentCafe";
}, {
    readonly value: "cosmetics";
    readonly labelKey: "settings.accentCosmetics";
}, {
    readonly value: "mobile";
    readonly labelKey: "settings.accentMobile";
}, {
    readonly value: "electronics";
    readonly labelKey: "settings.accentElectronics";
}];
/** Light-mode preview swatches (matches themes.css accent presets). Solid or CSS gradient. */
export declare const ACCENT_SWATCH: Record<AccentPreset, string>;
/** Maps legacy stored values to the current accent palette. Empty → colorful. */
export declare function normalizeAccent(accent?: string | null): AccentPreset;
export declare function applyAccent(accent: AccentPreset): void;
export declare function readStoredAccent(storageKey?: string): AccentPreset;
export declare function persistAccent(accent: AccentPreset, storageKey?: string): void;
//# sourceMappingURL=accent.d.ts.map