import { apiServer } from "@/lib/api-server"

export const revalidate = 60

export default async function TestimonialsPage() {
  let rows: {
    id: number
    author: string
    role?: string | null
    company?: string | null
    quote: string
    rating?: number | null
  }[] = []

  try {
    const res = await apiServer<{ data: typeof rows }>("/api/v1/public/testimonials")
    rows = res.data ?? []
  } catch {
    rows = []
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold">نظرات مشتریان</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {rows.map((t) => (
          <blockquote key={t.id} className="rounded-xl border p-6">
            <p className="text-sm leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
            <footer className="mt-4 text-sm font-medium">
              {t.author}
              {t.company ? (
                <span className="text-muted-foreground font-normal"> — {t.company}</span>
              ) : null}
            </footer>
          </blockquote>
        ))}
      </div>
    </div>
  )
}
