import type { ResolvedAdminRoute } from "@/kernel/types"

import ProductCatalogPageClient from "./product-catalog-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProductCatalogPageClient route={route} />
}
