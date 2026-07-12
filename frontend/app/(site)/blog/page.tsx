import Link from "next/link"

import { apiServer } from "@/lib/api-server"

export const revalidate = 60

type BlogList = {
  data: { id: number; slug: string; title: string; excerpt?: string | null; published_at?: string }[]
}

export default async function BlogIndexPage() {
  let posts: BlogList["data"] = []
  try {
    const res = await apiServer<{ data: BlogList["data"] }>("/api/v1/public/blog?per_page=12")
    posts = res.data ?? []
  } catch {
    posts = []
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold">وبلاگ</h1>
      <p className="text-muted-foreground mt-2 text-sm">آخرین مقالات و اخبار</p>
      <ul className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <li key={p.id} className="rounded-xl border p-5 transition hover:shadow-md">
            <Link href={`/blog/${p.slug}`} className="block">
              <h2 className="font-semibold">{p.title}</h2>
              {p.excerpt ? (
                <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">{p.excerpt}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {posts.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-sm">هنوز مطلبی منتشر نشده است.</p>
      ) : null}
    </div>
  )
}
