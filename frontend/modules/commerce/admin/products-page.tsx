import type { ResolvedAdminRoute } from "@/kernel/types"

import ProductsPageClient from "./products-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProductsPageClient route={route} />
}
