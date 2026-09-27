import type { ResolvedAdminRoute } from "@/kernel/types"

import ProductTagsPageClient from "./product-tags-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProductTagsPageClient route={route} />
}
