import type { ResolvedSiteRoute } from "@/kernel/types"
import LinkHubPublicPage from "./page-page-client"

export default function Page({
  route,
}: {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}) {
  const slug = route.params?.slug
  return <LinkHubPublicPage slug={slug} />
}
