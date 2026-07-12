import Link from "next/link"

import { apiServer } from "@/lib/api-server"

export const revalidate = 60

export default async function PortfolioIndexPage() {
  let items: { id: number; slug: string; title: string; description?: string | null; client?: string | null }[] = []
  try {
    const res = await apiServer<{ data: typeof items }>("/api/v1/public/portfolio")
    items = res.data ?? []
  } catch {
    items = []
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold">نمونه‌کارها</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/portfolio/${item.slug}`}
            className="rounded-xl border p-5 transition hover:shadow-md"
          >
            <h2 className="font-semibold">{item.title}</h2>
            {item.client ? (
              <p className="text-muted-foreground mt-1 text-xs">{item.client}</p>
            ) : null}
            {item.description ? (
              <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">{item.description}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  )
}
