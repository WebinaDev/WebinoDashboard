import { AnnouncementsAdminPage } from "@/views/admin/AnnouncementsAdminPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <AnnouncementsAdminPage />
}
