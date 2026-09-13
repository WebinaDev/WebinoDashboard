import type { ResolvedAdminRoute } from "@/kernel/types"

import BrandEditorPageClient from "./brand-editor-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BrandEditorPageClient route={route} />
}
