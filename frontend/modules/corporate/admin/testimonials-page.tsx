import { TestimonialsAdminPage } from "@/views/admin/TestimonialsAdminPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <TestimonialsAdminPage />
}
