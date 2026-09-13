import type { ResolvedAdminRoute } from "@/kernel/types"

import ProductEditorPageClient from "./product-editor-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProductEditorPageClient route={route} />
}
