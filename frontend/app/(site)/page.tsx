import Link from "next/link"

import { Button } from "@/components/ui/button"
import { apiServer } from "@/lib/api-server"
import { HomeBlocks } from "@/themes/corporate-demo-v1/components/HomeBlocks"

export const revalidate = 60

type HomeData = {
  data: {
    tenant: { name: string; branding?: Record<string, unknown> | null }
    blocks: { type: string; enabled?: boolean }[]
    announcements: { id: number; title: string; body?: string | null }[]
    testimonials: { id: number; author: string; quote: string; company?: string | null }[]
    portfolio: { id: number; slug: string; title: string; description?: string | null }[]
    blog: { id: number; slug: string; title: string; excerpt?: string | null }[]
  }
}

export default async function SiteHomePage() {
  let home: HomeData["data"] | null = null
  try {
    const res = await apiServer<HomeData>("/api/v1/public/home")
    home = res.data
  } catch {
    home = null
  }

  const name = home?.tenant?.name ?? "شرکت شما"

  return (
    <div>
      <HomeBlocks data={home} />
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold">آماده همکاری هستید؟</h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-sm">
          تیم {name} آماده پاسخگویی به سوالات شماست.
        </p>
        <Button asChild className="mt-6">
          <Link href="/consultation">درخواست مشاوره</Link>
        </Button>
      </section>
    </div>
  )
}
