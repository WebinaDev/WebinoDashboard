import type { ResolvedAdminRoute } from "@/kernel/types"

import MediaTermManagerPage from "@/components/media/MediaTermManagerPage"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <MediaTermManagerPage route={route} kind="folder" />
}
