import type { ResolvedAdminRoute } from "@/kernel/types"

import PosShiftPageClient from "./pos-shift-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PosShiftPageClient route={route} />
}
