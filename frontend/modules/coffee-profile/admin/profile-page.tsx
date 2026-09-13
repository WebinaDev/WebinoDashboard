import type { ResolvedAdminRoute } from "@/kernel/types"

import ProfilePageClient from "./profile-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ProfilePageClient route={route} />
}
