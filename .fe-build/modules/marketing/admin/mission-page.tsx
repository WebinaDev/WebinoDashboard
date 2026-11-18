import MissionPageClient from "./mission-page-client"

export default function MissionPage({
  route,
}: {
  route: import("@/kernel/types").ResolvedAdminRoute
}) {
  return <MissionPageClient route={route} />
}
