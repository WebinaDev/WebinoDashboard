import Link from "next/link"

import { Button } from "@/components/ui/button"

type HomeData = {
  tenant: { name: string; branding?: Record<string, unknown> | null }
  blocks: { type: string; enabled?: boolean }[]
  announcements: { id: number; title: string; body?: string | null }[]
  testimonials: { id: number; author: string; quote: string; company?: string | null }[]
  portfolio: { id: number; slug: string; title: string; description?: string | null }[]
  blog: { id: number; slug: string; title: string; excerpt?: string | null }[]
} | null

export function HomeBlocks({ data }: { data: HomeData }) {
  const name = data?.tenant?.name ?? "شرکت شما"
  const desc =
    (data?.tenant?.branding?.description as string | undefined) ??
    "راهکارهای حرفه‌ای برای رشد کسب‌وکار شما"

  return (
    <>
      <section className="bg-gradient-to-b from-primary/5 to-background border-b">
        <div className="container mx-auto px-4 py-20 text-center md:py-28">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{name}</h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">{desc}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/consultation">شروع همکاری</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/portfolio">مشاهده نمونه‌کارها</Link>
            </Button>
          </div>
        </div>
      </section>

      {(data?.portfolio?.length ?? 0) > 0 ? (
        <section className="container mx-auto px-4 py-16">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold">نمونه‌کارها</h2>
            <Link href="/portfolio" className="text-primary text-sm hover:underline">
              همه
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {data!.portfolio.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                href={`/portfolio/${p.slug}`}
                className="rounded-xl border p-5 transition hover:shadow-md"
              >
                <h3 className="font-medium">{p.title}</h3>
                {p.description ? (
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{p.description}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {(data?.testimonials?.length ?? 0) > 0 ? (
        <section className="bg-muted/30 py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-semibold">نظرات مشتریان</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {data!.testimonials.slice(0, 4).map((t) => (
                <blockquote key={t.id} className="rounded-xl border bg-background p-5 text-sm">
                  &ldquo;{t.quote}&rdquo;
                  <footer className="mt-3 font-medium">
                    {t.author}
                    {t.company ? ` — ${t.company}` : ""}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {(data?.announcements?.length ?? 0) > 0 ? (
        <section className="container mx-auto px-4 py-16">
          <h2 className="text-2xl font-semibold">اطلاعیه‌ها</h2>
          <ul className="mt-6 space-y-3">
            {data!.announcements.slice(0, 3).map((a) => (
              <li key={a.id} className="rounded-lg border px-4 py-3 text-sm">
                <span className="font-medium">{a.title}</span>
                {a.body ? <span className="text-muted-foreground"> — {a.body}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(data?.blog?.length ?? 0) > 0 ? (
        <section className="border-t py-16">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-2xl font-semibold">آخرین مطالب</h2>
              <Link href="/blog" className="text-primary text-sm hover:underline">
                وبلاگ
              </Link>
            </div>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {data!.blog.map((b) => (
                <li key={b.id}>
                  <Link href={`/blog/${b.slug}`} className="block rounded-xl border p-4 hover:shadow-sm">
                    <h3 className="font-medium">{b.title}</h3>
                    {b.excerpt ? (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{b.excerpt}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  )
}
