import type { ResolvedAdminRoute } from "@/kernel/types"
import PageEditorClient from "./page-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageEditorClient route={route} mode="business" />
}
