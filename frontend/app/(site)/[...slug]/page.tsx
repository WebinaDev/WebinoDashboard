import { renderSitePage } from "@/kernel/render-pages"

export const revalidate = 60

type Props = {
  params: Promise<{ slug: string[] }>
}

export default async function SiteCatchAllPage({ params }: Props) {
  const segments = (await params).slug ?? []
  return renderSitePage(segments)
}
