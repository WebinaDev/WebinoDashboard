import { getServerApiBase } from "@/lib/server-api-base"

export const revalidate = 300

export async function GET() {
  const apiBase = getServerApiBase()
  if (!apiBase) {
    return new Response("<?xml version=\"1.0\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>", {
      headers: { "Content-Type": "application/xml; charset=UTF-8" },
    })
  }
  const res = await fetch(`${apiBase}/api/v1/public/seo/sitemap/posts`, {
    headers: { Accept: "application/xml" },
    next: { revalidate: 300 },
  })
  const body = await res.text()
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/xml; charset=UTF-8", "Cache-Control": "public, max-age=300" },
  })
}
