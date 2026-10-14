import CataloguePage from "@/kernel/pages/CataloguePage"
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

export const revalidate = 60

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

  const built = await StorefrontBody({
    slug: "shop",
    fallback: classicShopDocument(),
    runtime: { categorySlug: searchParams?.category },
  })
  return (
    <ThemeSlot kind="product_archive" runtime={{ categorySlug: searchParams?.category }}>
      {classic ? null : <ProductStoriesStrip />}
      {built ?? <CataloguePage />}
    </ThemeSlot>
  )
}
