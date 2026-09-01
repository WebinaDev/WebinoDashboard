export declare const ACCENT_PRESETS: readonly ["zinc", "slate", "blue", "green", "rose", "orange"];
export type AccentPreset = (typeof ACCENT_PRESETS)[number];
export declare function normalizeAccent(accent?: string | null): AccentPreset;
export declare function applyAccent(accent: AccentPreset): void;
export declare function readStoredAccent(storageKey?: string): AccentPreset;
export declare function persistAccent(accent: AccentPreset, storageKey?: string): void;
