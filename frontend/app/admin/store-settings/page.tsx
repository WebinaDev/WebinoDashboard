import { createPage } from "@/lib/create-page"

const StoreSettingsPage = createPage(() => import("@/pages/StoreSettingsPage"))

export default function Page() {
  return <StoreSettingsPage />
}
