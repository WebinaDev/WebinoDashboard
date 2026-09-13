import { MagazineAdminPage } from "@/views/admin/MagazineAdminPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <MagazineAdminPage />
}
