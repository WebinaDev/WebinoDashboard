import type { ResolvedAdminRoute } from "@/kernel/types"
import ProfilesPageClient from "./profiles-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProfilesPageClient route={route} />
}
