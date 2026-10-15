/** Page language → text direction (pure; shared by the canvas, site shell and <html>). */
export const RTL_LANGS = ["fa", "ar", "ku", "ur", "he"];
export function dirForLang(lang, fallback = "rtl") {
    if (!lang)
        return fallback;
    return RTL_LANGS.includes(lang.toLowerCase().split("-")[0]) ? "rtl" : "ltr";
}
/** Builder page slug from a storefront path (`/pages/<slug>`), or null. */
export function pageSlugFromPath(path) {
    const m = /^\/pages\/([^/?#]+)\/?(?:[?#].*)?$/.exec(path ?? "");
    if (!m)
        return null;
    try {
        return decodeURIComponent(m[1]);
    }
    catch {
        return null;
    }
}
/** UI message catalogue for a page language: fa/en as-is; other RTL languages → fa, other LTR languages → en. */
export function uiLocaleForLang(lang) {
    const base = lang.toLowerCase().split("-")[0];
    if (base === "fa" || base === "en")
        return base;
    return dirForLang(base) === "rtl" ? "fa" : "en";
}
/** Preview token from `/preview/<token>`, or null. */
export function previewTokenFromPath(path) {
    const m = /^\/preview\/(\d+\.[a-f0-9]{48})\/?(?:[?#].*)?$/.exec(path ?? "");
    return m ? m[1] : null;
}
