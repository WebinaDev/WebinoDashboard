import ReferralPageClient from "./referral-page-client"

export default function ReferralPage({
  route,
}: {
  route: import("@/kernel/types").ResolvedAdminRoute
}) {
  return <ReferralPageClient route={route} />
}
