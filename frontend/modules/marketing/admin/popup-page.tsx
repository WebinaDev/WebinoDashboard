import PopupPageClient from "./popup-page-client"

export default function PopupPage({
  route,
}: {
  route: import("@/kernel/types").ResolvedAdminRoute
}) {
  return <PopupPageClient route={route} />
}
