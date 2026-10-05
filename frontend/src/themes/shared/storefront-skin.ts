/** Map active theme slug → shell classes for storefront visual differentiation. */
export function storefrontShellClass(themeSlug?: string | null): string {
  switch (themeSlug) {
    case "ecommerce-classic":
      return "sf-shell sf-classic sf-skin-classic"
    case "ecommerce-default":
      return "sf-shell sf-skin-default"
    case "ecommerce-starter":
      return "sf-shell sf-skin-starter"
    case "ecommerce-demo-v1":
      return "sf-shell sf-skin-demo"
    default:
      return ""
  }
}

export function storefrontThemeClass(themeSlug?: string | null): string {
  switch (themeSlug) {
    case "ecommerce-classic":
      return "sf-classic"
    case "ecommerce-default":
      return "sf-skin-default"
    case "ecommerce-starter":
      return "sf-skin-starter"
    case "ecommerce-demo-v1":
      return "sf-skin-demo"
    default:
      return ""
  }
}

/** Published builder chrome (store-header) is shaped for classic; other ecommerce themes use their own SiteHeader. */
export function usePublishedStorefrontChrome(themeSlug?: string | null): boolean {
  return themeSlug === "ecommerce-classic"
}
