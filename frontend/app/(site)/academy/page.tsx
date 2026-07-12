import Link from "next/link"

import { apiServer } from "@/lib/api-server"

export const revalidate = 60

export default async function AcademyIndexPage() {
  let courses: { id: number; slug: string; title: string; description?: string | null }[] = []
  try {
    const res = await apiServer<{ data: typeof courses }>("/api/v1/public/academy")
    courses = res.data ?? []
  } catch {
    courses = []
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold">آکادمی</h1>
      <p className="text-muted-foreground mt-2 text-sm">دوره‌ها و آموزش‌ها</p>
      <ul className="mt-8 grid gap-6 md:grid-cols-2">
        {courses.map((c) => (
          <li key={c.id} className="rounded-xl border p-5">
            <Link href={`/academy/${c.slug}`} className="font-semibold hover:underline">
              {c.title}
            </Link>
            {c.description ? (
              <p className="text-muted-foreground mt-2 text-sm">{c.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
