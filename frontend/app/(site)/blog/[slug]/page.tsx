import Link from "next/link"
import { notFound } from "next/navigation"

import { apiServer } from "@/lib/api-server"

export const revalidate = 60

type Post = {
  data: {
    title: string
    excerpt?: string | null
    body?: string | null
    published_at?: string
    category?: { name: string; slug: string } | null
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let post: Post["data"] | null = null
  try {
    const res = await apiServer<Post>(`/api/v1/public/blog/${slug}`)
    post = res.data
  } catch {
    notFound()
  }

  return (
    <article className="container mx-auto max-w-3xl px-4 py-12">
      {post.category ? (
        <Link
          href={`/blog/category/${post.category.slug}`}
          className="text-primary text-sm font-medium"
        >
          {post.category.name}
        </Link>
      ) : null}
      <h1 className="mt-2 text-3xl font-bold">{post.title}</h1>
      {post.excerpt ? <p className="text-muted-foreground mt-4 text-lg">{post.excerpt}</p> : null}
      <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none whitespace-pre-wrap">
        {post.body}
      </div>
    </article>
  )
}
