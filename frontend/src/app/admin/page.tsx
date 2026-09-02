import { renderAdminPage } from "@/kernel/render-pages"

export const dynamic = "force-dynamic"

export default function AdminRootPage() {
  return renderAdminPage([])
}
