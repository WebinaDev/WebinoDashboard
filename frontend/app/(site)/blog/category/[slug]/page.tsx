import Link from "next/link"

import { apiServer } from "@/lib/api-server"

export const revalidate = 60

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  let category: { name: string; slug: string } | null = null
  let posts: { id: number; slug: string; title: string; excerpt?: string | null }[] = []

  try {
    const res = await apiServer<{
      data: {
        category: { name: string; slug: string }
        posts: { data: typeof posts }
      }
    }>(`/api/v1/public/blog/category/${slug}`)
    category = res.data.category
    posts = res.data.posts?.data ?? []
  } catch {
    category = null
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold">{category?.name ?? "دسته‌بندی"}</h1>
      <ul className="mt-8 space-y-4">
        {posts.map((p) => (
          <li key={p.id} className="rounded-lg border p-4">
            <Link href={`/blog/${p.slug}`} className="font-medium hover:underline">
              {p.title}
            </Link>
            {p.excerpt ? (
              <p className="text-muted-foreground mt-1 text-sm">{p.excerpt}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
