import type { ResolvedAdminRoute } from "@/kernel/types"
import InboxPageClient from "./inbox-page-client"
export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <InboxPageClient route={route} />
}
