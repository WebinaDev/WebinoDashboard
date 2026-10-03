/** Shared UI locale helpers (`fa` | `en`). */
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
const JALALI_MONTHS = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
];
/** Iran has no DST; wall clock is UTC+03:30. */
const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
/** Missing-value glyph. Farsi avoids the em dash. */
export function emptyMark(locale) {
    return normalizeUiLocale(locale) === "fa" ? "-" : "—";
}
/** Convert Latin digits to locale digits (`fa` → Persian ۰۱۲…). */
export function toLocaleDigits(value, locale) {
    const text = String(value);
    if (normalizeUiLocale(locale) !== "fa") {
        return text;
    }
    return text.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}
/** Normalize Persian/Arabic-Indic digits to Latin before API submit. */
export function toLatinDigits(value) {
    return value
        .replace(/[۰-۹]/g, (d) => LATIN_DIGITS[PERSIAN_DIGITS.indexOf(d)] ?? d)
        .replace(/[٠-٩]/g, (d) => LATIN_DIGITS[ARABIC_DIGITS.indexOf(d)] ?? d);
}
export function formatNumber(value, locale, options) {
    const n = Number(value);
    const useFa = normalizeUiLocale(locale) === "fa";
    if (!Number.isFinite(n)) {
        return useFa ? toLocaleDigits(String(value), "fa") : String(value);
    }
    const formatted = new Intl.NumberFormat(useFa ? "fa-IR" : "en-US", {
        maximumFractionDigits: 0,
        ...options,
        numberingSystem: useFa ? "arabext" : "latn",
    }).format(n);
    return useFa ? toLocaleDigits(formatted, "fa") : formatted;
}
export function formatCurrency(value, locale, currency = "IRR", options) {
    const n = Number(value);
    const useFa = normalizeUiLocale(locale) === "fa";
    if (!Number.isFinite(n)) {
        return useFa ? toLocaleDigits(String(value), "fa") : String(value);
    }
    const formatted = new Intl.NumberFormat(useFa ? "fa-IR" : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
        ...options,
        numberingSystem: useFa ? "arabext" : "latn",
    }).format(n);
    return useFa ? toLocaleDigits(formatted, "fa") : formatted;
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function div(a, b) {
    return Math.trunc(a / b);
}
/** Gregorian → Jalali (Borkowski / jalaali algorithm). */
export function toJalali(gy, gm, gd) {
    const gDayOffset = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = gy <= 1600 ? 0 : 979;
    let year = gy - (gy <= 1600 ? 621 : 1600);
    const gy2 = gm > 2 ? year + 1 : year;
    let days = 365 * year +
        div(gy2 + 3, 4) -
        div(gy2 + 99, 100) +
        div(gy2 + 399, 400) -
        80 +
        gd +
        (gDayOffset[gm - 1] ?? 0);
    jy += 33 * div(days, 12053);
    days %= 12053;
    jy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) {
        jy += div(days - 1, 365);
        days = (days - 1) % 365;
    }
    const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return { jy, jm, jd };
}
function civilFromInstant(date) {
    const shifted = new Date(date.getTime() + TEHRAN_OFFSET_MS);
    return {
        y: shifted.getUTCFullYear(),
        m: shifted.getUTCMonth() + 1,
        d: shifted.getUTCDate(),
        hh: shifted.getUTCHours(),
        mm: shifted.getUTCMinutes(),
        hasTime: true,
    };
}
/** Calendar parts. Naive `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` stay wall-clock; zoned instants convert to Tehran. */
export function resolveCivil(value) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : civilFromInstant(value);
    }
    if (typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : civilFromInstant(date);
    }
    const text = value.trim();
    if (!text)
        return null;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (dateOnly) {
        return {
            y: Number(dateOnly[1]),
            m: Number(dateOnly[2]),
            d: Number(dateOnly[3]),
            hh: 0,
            mm: 0,
            hasTime: false,
        };
    }
    const wall = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/.exec(text);
    if (wall) {
        return {
            y: Number(wall[1]),
            m: Number(wall[2]),
            d: Number(wall[3]),
            hh: Number(wall[4]),
            mm: Number(wall[5]),
            hasTime: true,
        };
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime()))
        return null;
    const civil = civilFromInstant(date);
    civil.hasTime = /[T ]\d{2}:\d{2}/.test(text);
    return civil;
}
function isoWeekStart(year, week) {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Dow = (jan4.getUTCDay() + 6) % 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - jan4Dow + (week - 1) * 7);
    return {
        y: monday.getUTCFullYear(),
        m: monday.getUTCMonth() + 1,
        d: monday.getUTCDate(),
    };
}
function jalaliMonthName(month) {
    return JALALI_MONTHS[month - 1] ?? String(month);
}
/**
 * Chart axis / tooltip label.
 * `Y-m-d`, `Y-m`, and `Y-Www` become Jalali + Persian digits for `fa`.
 * Other text only has its digits localized.
 */
export function formatChartDateLabel(value, locale) {
    const text = String(value).trim();
    const fa = normalizeUiLocale(locale) === "fa";
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const month = /^(\d{4})-(\d{2})$/.exec(text);
    const week = /^(\d{4})-W(\d{1,2})$/.exec(text);
    if (day) {
        const y = Number(day[1]);
        const m = Number(day[2]);
        const d = Number(day[3]);
        if (fa && y >= 1700) {
            const j = toJalali(y, m, d);
            return toLocaleDigits(`${j.jd} ${jalaliMonthName(j.jm)}`, "fa");
        }
        if (fa)
            return toLocaleDigits(`${d} ${jalaliMonthName(m)}`, "fa");
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
        }).format(new Date(Date.UTC(y, m - 1, d)));
    }
    if (month) {
        const y = Number(month[1]);
        const m = Number(month[2]);
        if (y < 1700) {
            const label = `${jalaliMonthName(m)} ${y}`;
            return fa ? toLocaleDigits(label, "fa") : label;
        }
        if (fa) {
            const j = toJalali(y, m, 15);
            return toLocaleDigits(`${jalaliMonthName(j.jm)} ${j.jy}`, "fa");
        }
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
        }).format(new Date(Date.UTC(y, m - 1, 1)));
    }
    if (week) {
        const start = isoWeekStart(Number(week[1]), Number(week[2]));
        return formatChartDateLabel(`${start.y}-${pad2(start.m)}-${pad2(start.d)}`, locale);
    }
    const isoDay = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(text);
    if (isoDay)
        return formatChartDateLabel(isoDay[1], locale);
    return fa ? toLocaleDigits(text, "fa") : text;
}
/** Month + year for a timestamp or ISO value. Jalali for `fa`. */
export function formatMonthYear(value, locale) {
    const civil = resolveCivil(value);
    if (!civil)
        return emptyMark(locale);
    return formatChartDateLabel(`${civil.y}-${pad2(civil.m)}`, locale);
}
function jalaliText(civil, style, withTime) {
    const j = toJalali(civil.y, civil.m, civil.d);
    const date = style === "short"
        ? `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`
        : `${j.jd} ${jalaliMonthName(j.jm)} ${j.jy}`;
    if (!withTime || !civil.hasTime)
        return toLocaleDigits(date, "fa");
    return toLocaleDigits(`${date} ${pad2(civil.hh)}:${pad2(civil.mm)}`, "fa");
}
/** Jalali + Persian digits for `fa`. Gregorian `en-US` otherwise. */
export function formatDate(value, locale, options) {
    const useFa = normalizeUiLocale(locale) === "fa";
    if (value == null || value === "")
        return emptyMark(locale);
    const civil = resolveCivil(value);
    if (!civil) {
        const text = String(value);
        return useFa ? toLocaleDigits(text, "fa") : text;
    }
    const { includeTime, timeStyle, dateStyle, month, year, day, ...intlOpts } = options ?? {};
    const withTime = Boolean(includeTime || timeStyle);
    if (useFa) {
        if (month && year && day == null && !dateStyle) {
            return formatChartDateLabel(`${civil.y}-${pad2(civil.m)}`, "fa");
        }
        const style = dateStyle === "short" ? "short" : "medium";
        return jalaliText(civil, style, withTime);
    }
    let date = value instanceof Date
        ? value
        : new Date(typeof value === "number" ? value : String(value));
    if (Number.isNaN(date.getTime())) {
        date = new Date(civil.y, civil.m - 1, civil.d, civil.hh, civil.mm);
    }
    if (Number.isNaN(date.getTime()))
        return String(value);
    const base = {
        dateStyle: dateStyle ?? "medium",
        ...(withTime ? { timeStyle: timeStyle ?? "short" } : {}),
        ...intlOpts,
    };
    if (month && year && day == null && !dateStyle) {
        return new Intl.DateTimeFormat("en-US", { month, year, ...intlOpts }).format(date);
    }
    return new Intl.DateTimeFormat("en-US", base).format(date);
}
