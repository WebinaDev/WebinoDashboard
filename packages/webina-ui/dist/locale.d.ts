export type UiLocale = "en" | "fa";
export declare function normalizeUiLocale(locale?: string | null): UiLocale;
export declare function isRtlLocale(locale?: string | null): boolean;
export declare function getIntlLocale(locale?: string | null): string;
export declare function toLocaleDigits(value: string | number, locale?: string | null): string;
export declare function toLatinDigits(value: string): string;
export declare function formatNumber(value: number, locale?: string | null, options?: Intl.NumberFormatOptions): string;
export declare function formatCurrency(value: number, locale?: string | null, currency?: string, options?: Intl.NumberFormatOptions): string;
export type FormatDateOptions = Intl.DateTimeFormatOptions & {
    includeTime?: boolean;
};
export declare function formatDate(value: string | number | Date, locale?: string | null, options?: FormatDateOptions): string;
