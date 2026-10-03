/** Shared UI locale helpers (`fa` | `en`). */
export type UiLocale = "en" | "fa";
export declare function normalizeUiLocale(locale?: string | null): UiLocale;
export declare function isRtlLocale(locale?: string | null): boolean;
/** Document direction for the locale (`fa` → RTL). */
export declare function htmlDir(locale?: string | null): "rtl" | "ltr";
/**
 * Physical side for shadcn Sidebar / Sheet / dropdowns.
 * Farsi: right. English: left.
 */
export declare function sidebarSide(locale?: string | null): "left" | "right";
export declare function getIntlLocale(locale?: string | null): string;
/** Missing-value glyph. Farsi avoids the em dash. */
export declare function emptyMark(locale?: string | null): string;
/** Convert Latin digits to locale digits (`fa` → Persian ۰۱۲…). */
export declare function toLocaleDigits(value: string | number, locale?: string | null): string;
/** Normalize Persian/Arabic-Indic digits to Latin before API submit. */
export declare function toLatinDigits(value: string): string;
export declare function formatNumber(value: number, locale?: string | null, options?: Intl.NumberFormatOptions): string;
export declare function formatCurrency(value: number, locale?: string | null, currency?: string, options?: Intl.NumberFormatOptions): string;
type Civil = {
    y: number;
    m: number;
    d: number;
    hh: number;
    mm: number;
    hasTime: boolean;
};
/** Gregorian → Jalali (Borkowski / jalaali algorithm). */
export declare function toJalali(gy: number, gm: number, gd: number): {
    jy: number;
    jm: number;
    jd: number;
};
/** Calendar parts. Naive `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` stay wall-clock; zoned instants convert to Tehran. */
export declare function resolveCivil(value: string | number | Date): Civil | null;
/**
 * Chart axis / tooltip label.
 * `Y-m-d`, `Y-m`, and `Y-Www` become Jalali + Persian digits for `fa`.
 * Other text only has its digits localized.
 */
export declare function formatChartDateLabel(value: string | number, locale?: string | null): string;
/** Month + year for a timestamp or ISO value. Jalali for `fa`. */
export declare function formatMonthYear(value: string | number | Date, locale?: string | null): string;
export type FormatDateOptions = Intl.DateTimeFormatOptions & {
    includeTime?: boolean;
};
/** Jalali + Persian digits for `fa`. Gregorian `en-US` otherwise. */
export declare function formatDate(value: string | number | Date, locale?: string | null, options?: FormatDateOptions): string;
export {};
//# sourceMappingURL=locale.d.ts.map