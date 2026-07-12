import { createPage } from "@/lib/create-page"

const ConsultationsAdminPage = createPage(() =>
  import("@/pages/admin/ConsultationsAdminPage").then((m) => ({ default: m.ConsultationsAdminPage })),
)

export default function Page() {
  return <ConsultationsAdminPage />
}
