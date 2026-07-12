import { createPage } from "@/lib/create-page"

const AnnouncementsAdminPage = createPage(() =>
  import("@/pages/admin/AnnouncementsAdminPage").then((m) => ({ default: m.AnnouncementsAdminPage })),
)

export default function Page() {
  return <AnnouncementsAdminPage />
}
