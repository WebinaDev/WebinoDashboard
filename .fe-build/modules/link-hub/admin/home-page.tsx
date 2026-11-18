import type { ResolvedAdminRoute } from "@/kernel/types"
import HomePageClient from "./home-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <HomePageClient route={route} />
}
