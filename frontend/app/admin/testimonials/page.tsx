import { createPage } from "@/lib/create-page"

const TestimonialsAdminPage = createPage(() =>
  import("@/pages/admin/TestimonialsAdminPage").then((m) => ({ default: m.TestimonialsAdminPage })),
)

export default function Page() {
  return <TestimonialsAdminPage />
}
