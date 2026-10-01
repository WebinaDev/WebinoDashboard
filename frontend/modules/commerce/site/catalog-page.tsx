import CataloguePage from "@/kernel/pages/CataloguePage"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { PublishedDocument, StorefrontBody, loadPublishedPage } from "@/builder/public-document"
import {
  ishopAccountDocument,
  ishopCartDocument,
  ishopCheckoutDocument,
  ishopProductDocument,
  ishopShopDocument,
} from "@/builder/templates/ishop"

export const revalidate = 60

async function themedOrPublished(
  slug: string,
  fallback: ReturnType<typeof ishopProductDocument>,
  runtime?: { productSlug?: string; categorySlug?: string },
) {
  const published = await loadPublishedPage(slug)
  return <PublishedDocument document={published ?? fallback} runtime={runtime} />
}

export default async function Page({
  route,
  searchParams,
}: {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}) {
  if (route.path === "product/:slug") {
    return themedOrPublished("product", ishopProductDocument(), { productSlug: route.params?.slug })
  }
  if (route.path === "cart") {
    return themedOrPublished("cart", ishopCartDocument())
  }
  if (route.path === "checkout") {
    return themedOrPublished("checkout", ishopCheckoutDocument())
  }
  if (route.path === "account") {
    return themedOrPublished("account", ishopAccountDocument())
  }

  const built = await StorefrontBody({
    slug: "shop",
    fallback: ishopShopDocument(),
    runtime: { categorySlug: searchParams?.category },
  })
  if (built) return built
  return <CataloguePage />
}
