import type { ResolvedAdminRoute } from "@/kernel/types"

import AttributeEditorPageClient from "./attribute-editor-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <AttributeEditorPageClient route={route} />
}
