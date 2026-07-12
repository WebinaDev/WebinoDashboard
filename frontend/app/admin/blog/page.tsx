import { createPage } from "@/lib/create-page"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Blog — Webino Admin",
}

const BlogAdminPage = createPage(() =>
  import("@/pages/admin/BlogAdminPage").then((m) => ({ default: m.BlogAdminPage })),
)

export default function Page() {
  return <BlogAdminPage />
}
