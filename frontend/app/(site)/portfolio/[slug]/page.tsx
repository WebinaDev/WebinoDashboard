import { notFound } from "next/navigation"

import { apiServer } from "@/lib/api-server"

type PortfolioItem = {
  title: string
  description?: string | null
  client?: string | null
  category?: string | null
}

export const revalidate = 60

export default async function PortfolioItemPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  let item: PortfolioItem | null = null

  try {
    const res = await apiServer<{ data: PortfolioItem }>(
      `/api/v1/public/portfolio/${slug}`,
    )
    item = res.data
  } catch {
    notFound()
  }

  if (!item) {
    notFound()
  }

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{item.title}</h1>
      <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-sm">
        {item.client ? <span>مشتری: {item.client}</span> : null}
        {item.category ? <span>دسته: {item.category}</span> : null}
      </div>
      {item.description ? (
        <p className="mt-8 whitespace-pre-wrap leading-relaxed">{item.description}</p>
      ) : null}
    </article>
  )
}
