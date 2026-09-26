import { renderAdminPage } from "@/kernel/render-pages"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ slug: string[] }>
}

export default async function AdminCatchAllPage({ params }: Props) {
  const segments = (await params).slug ?? []
  return renderAdminPage(segments)
}
