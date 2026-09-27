import type { ResolvedAdminRoute } from "@/kernel/types"
import AiShellPageClient from "./ai-shell-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <AiShellPageClient route={route} />
}
