import type { ResolvedAdminRoute } from "@/kernel/types"

import ProductCategoriesPageClient from "./product-categories-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProductCategoriesPageClient route={route} />
}
