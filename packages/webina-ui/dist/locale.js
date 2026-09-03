export function normalizeUiLocale(locale) {
    if (!locale)
        return "fa";
    return locale.toLowerCase().startsWith("fa") ? "fa" : "en";
}
export function isRtlLocale(locale) {
    return normalizeUiLocale(locale) === "fa";
}
/** Document direction for the locale (`fa` → RTL). */
export function htmlDir(locale) {
    return isRtlLocale(locale) ? "rtl" : "ltr";
}
/**
 * Physical side for shadcn Sidebar / Sheet / dropdowns.
 * Farsi: right. English: left.
 */
export function sidebarSide(locale) {
    return isRtlLocale(locale) ? "right" : "left";
}
export function getIntlLocale(locale) {
    return normalizeUiLocale(locale) === "fa" ? "fa-IR" : "en-US";
}
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const LATIN_DIGITS = "0123456789";
export function toLocaleDigits(value, locale) {
    const text = String(value);
    if (normalizeUiLocale(locale) !== "fa") {
        return text;
    }
    return text.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}
export function toLatinDigits(value) {
    return value
        .replace(/[۰-۹]/g, (d) => LATIN_DIGITS[PERSIAN_DIGITS.indexOf(d)] ?? d)
        .replace(/[٠-٩]/g, (d) => LATIN_DIGITS[ARABIC_DIGITS.indexOf(d)] ?? d);
}
export function formatNumber(value, locale, options) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return String(value);
    }
    const useFa = normalizeUiLocale(locale) === "fa";
    return new Intl.NumberFormat(useFa ? "fa-IR" : "en-US", {
        maximumFractionDigits: 0,
        numberingSystem: useFa ? "arabext" : "latn",
        ...options,
    }).format(n);
}
export function formatCurrency(value, locale, currency = "IRR", options) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return String(value);
    }
    const useFa = normalizeUiLocale(locale) === "fa";
    return new Intl.NumberFormat(useFa ? "fa-IR" : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
        numberingSystem: useFa ? "arabext" : "latn",
        ...options,
    }).format(n);
}
export function formatDate(value, locale, options) {
    const date = value instanceof Date
        ? value
        : new Date(typeof value === "number" ? value : String(value));
    if (Number.isNaN(date.getTime())) {
        return value == null || value === "" ? "—" : String(value);
    }
    const useFa = normalizeUiLocale(locale) === "fa";
    const { includeTime, ...intlOpts } = options ?? {};
    const base = {
        dateStyle: "medium",
        ...(includeTime ? { timeStyle: "short" } : {}),
        ...intlOpts,
    };
    if (useFa) {
        return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
            numberingSystem: "arabext",
            ...base,
        }).format(date);
    }
    return new Intl.DateTimeFormat("en-US", base).format(date);
}
