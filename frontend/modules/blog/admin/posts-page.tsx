import { BlogAdminPage } from "@/views/admin/BlogAdminPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <BlogAdminPage />
}
