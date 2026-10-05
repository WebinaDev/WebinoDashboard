import { getServerApiBase } from "@/lib/server-api-base"

export async function fetchPublicSeo(path: string): Promise<Response> {
  const apiBase = getServerApiBase()
  if (!apiBase) {
    return new Response("", { status: 404 })
  }
  return fetch(`${apiBase}/api/v1/public/seo/${path}`, {
    headers: { Accept: "application/xml, text/plain, application/json" },
    next: { revalidate: 300 },
  })
}
