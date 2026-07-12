import { notFound } from "next/navigation"

import { apiServer } from "@/lib/api-server"

type CmsPage = {
  title: string
  body?: string | null
}

export const revalidate = 60

export default async function CmsPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let page: CmsPage | null = null

  try {
    const res = await apiServer<{ data: CmsPage }>(`/api/v1/public/pages/${slug}`)
    page = res.data
  } catch {
    notFound()
  }

  if (!page) {
    notFound()
  }

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{page.title}</h1>
      <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none whitespace-pre-wrap">
        {page.body}
      </div>
    </article>
  )
}
