import { redirect } from "next/navigation"

import CataloguePage from "@/kernel/pages/CataloguePage"
import { getSiteTypeSlug } from "@/kernel/cafe-catalogue-data"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { StorefrontBody, StorefrontDocument, activeThemeSlug, loadPublishedPage } from "@/builder/public-document"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import {
  classicAccountDocument,
  classicCartDocument,
  classicCheckoutDocument,
  classicProductDocument,
  classicShopDocument,
  storeCartDocument,
  storeProductDocument,
} from "@/builder/templates/classic"
import { ProductStoriesStrip } from "@/builder/storefront/storefront-extras"
import { ArchiveScopeProvider, type ArchiveScope } from "@/builder/storefront/archive-scope"
import { loadCatalogSeed } from "@/builder/storefront/catalog-seed"
import { CatalogSeedProvider } from "@/builder/storefront/use-catalog"

export const revalidate = 60

const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

async function themedOrPublished(
  slug: string,
  fallback: ReturnType<typeof classicProductDocument>,
  runtime?: { productSlug?: string; categorySlug?: string },
) {
  const published = await loadPublishedPage(slug)
  return <StorefrontDocument document={published ?? fallback} runtime={runtime} />
}

export default async function Page({
  route,
  searchParams,
}: {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}) {
  // Cafe sites have one cart: the server-side guest cart (commerce orders, stock, shop payment
  // gateways) shown in the menu drawer. The shop cart/checkout pages only knew the signed-in
  // `/api/v1/cart`, so guests saw an empty or stuck "loading" cart without their cafe items.
  if (["cart", "checkout", "product/:slug"].includes(route.path) && (await getSiteTypeSlug().catch(() => null)) === "cafe") {
    if (route.path === "product/:slug" && route.params?.slug) redirect(`/catalogue/${encodeURIComponent(route.params.slug)}`)
    redirect("/menu?cart=open")
  }
  const classic = (await activeThemeSlug().catch(() => null)) === "ecommerce-classic"
  if (route.path === "product/:slug") {
    const slug = route.params?.slug
    return (
      <ThemeSlot kind="single_product" runtime={{ productSlug: slug }}>
        {await themedOrPublished("product", classic ? classicProductDocument() : storeProductDocument(), { productSlug: slug })}
      </ThemeSlot>
    )
  }
  if (route.path === "cart") {
    return <ThemeSlot kind="cart">{await themedOrPublished("cart", classic ? classicCartDocument() : storeCartDocument())}</ThemeSlot>
  }
  if (route.path === "checkout") {
    return <ThemeSlot kind="checkout">{await themedOrPublished("checkout", classicCheckoutDocument())}</ThemeSlot>
  }
  if (route.path === "account") {
    return <ThemeSlot kind="account">{await themedOrPublished("account", classicAccountDocument())}</ThemeSlot>
  }

  // Pretty archive URLs (/product-category/x, /brand/x, /product-tag/x — and the root /{slug}/ and
  // /برند/{slug}/ forms the catch-all resolves onto them) scope the shop without query params.
  const pretty = route.params?.slug ? safeDecode(route.params.slug) : ""
  const scope: ArchiveScope = {}
  if (pretty && route.path === "product-category/:slug") scope.category = pretty
  if (pretty && route.path === "brand/:slug") scope.brand = pretty
  if (pretty && route.path === "product-tag/:slug") scope.tag = pretty
  const categorySlug = scope.category ?? searchParams?.category
  const [built, seed] = await Promise.all([
    StorefrontBody({
      slug: "shop",
      fallback: classicShopDocument(),
      runtime: { categorySlug },
    }),
    loadCatalogSeed(searchParams, scope),
  ])
  return (
    <CatalogSeedProvider seed={seed}>
    <ArchiveScopeProvider scope={scope}>
      <ThemeSlot kind="product_archive" runtime={{ categorySlug }}>
        {classic ? null : <ProductStoriesStrip />}
        {built ?? <CataloguePage />}
      </ThemeSlot>
    </ArchiveScopeProvider>
    </CatalogSeedProvider>
  )
}
