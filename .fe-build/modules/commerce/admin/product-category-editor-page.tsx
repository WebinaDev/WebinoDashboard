import type { ResolvedAdminRoute } from "@/kernel/types"

import ProductCategoryEditorPageClient from "./product-category-editor-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProductCategoryEditorPageClient route={route} />
}
