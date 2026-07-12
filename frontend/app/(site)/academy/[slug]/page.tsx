import { notFound } from "next/navigation"

import { apiServer } from "@/lib/api-server"

type AcademyCourse = {
  title: string
  description?: string | null
  lessons?: { title: string; slug: string; content?: string | null }[]
}

export const revalidate = 60

export default async function AcademyCoursePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  let course: AcademyCourse | null = null

  try {
    const res = await apiServer<{ data: AcademyCourse }>(
      `/api/v1/public/academy/${slug}`,
    )
    course = res.data
  } catch {
    notFound()
  }

  if (!course) {
    notFound()
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{course.title}</h1>
      {course.description ? (
        <p className="text-muted-foreground mt-4">{course.description}</p>
      ) : null}
      <ol className="mt-8 space-y-4">
        {(course.lessons ?? []).map((l, i) => (
          <li key={l.slug} className="rounded-lg border p-4">
            <h2 className="font-medium">
              {i + 1}. {l.title}
            </h2>
            {l.content ? (
              <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-sm">{l.content}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
