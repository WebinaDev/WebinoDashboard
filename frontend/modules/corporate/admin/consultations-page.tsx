import { ConsultationsAdminPage } from "@/views/admin/ConsultationsAdminPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <ConsultationsAdminPage />
}
