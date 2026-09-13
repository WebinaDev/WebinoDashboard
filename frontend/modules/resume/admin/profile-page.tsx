import type { ResolvedAdminRoute } from "@/kernel/types"

import ResumeProfilePageClient from "./profile-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ResumeProfilePageClient route={route} />
}
