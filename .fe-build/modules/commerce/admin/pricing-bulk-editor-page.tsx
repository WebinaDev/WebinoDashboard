import type { ResolvedAdminRoute } from "@/kernel/types"

import PricingBulkEditorPageClient from "./pricing-bulk-editor-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PricingBulkEditorPageClient route={route} />
}
