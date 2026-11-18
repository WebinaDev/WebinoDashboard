import GiftPageClient from "./gift-page-client"

export default function GiftPage({
  route,
}: {
  route: import("@/kernel/types").ResolvedAdminRoute
}) {
  return <GiftPageClient route={route} />
}
