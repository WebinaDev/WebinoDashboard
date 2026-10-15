/** Page language → text direction (pure; shared by the canvas, site shell and <html>). */
export declare const RTL_LANGS: readonly ["fa", "ar", "ku", "ur", "he"];
export declare function dirForLang(lang: string | null | undefined, fallback?: "rtl" | "ltr"): "rtl" | "ltr";
/** Builder page slug from a storefront path (`/pages/<slug>`), or null. */
export declare function pageSlugFromPath(path: string | null | undefined): string | null;
/** UI message catalogue for a page language: fa/en as-is; other RTL languages → fa, other LTR languages → en. */
export declare function uiLocaleForLang(lang: string): "fa" | "en";
/** Preview token from `/preview/<token>`, or null. */
export declare function previewTokenFromPath(path: string | null | undefined): string | null;
//# sourceMappingURL=lang.d.ts.map