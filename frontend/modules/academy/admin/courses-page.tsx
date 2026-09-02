import { AcademyAdminPage } from "@/views/admin/AcademyAdminPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <AcademyAdminPage />
}
