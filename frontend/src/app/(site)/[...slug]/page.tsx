import { renderSitePage } from "@/kernel/render-pages"

export const revalidate = 60

type Props = {
  params: Promise<{ slug: string[] }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SiteCatchAllPage({ params, searchParams }: Props) {
  const segments = (await params).slug ?? []
  const sp = searchParams ? await searchParams : {}
  return renderSitePage(segments, sp)
}
