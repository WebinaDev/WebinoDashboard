import { timingSafeEqual } from "node:crypto"
import { revalidatePath, revalidateTag } from "next/cache"

/**
 * On-demand cache purge, called by the backend after a builder page/global/theme save (all tenants).
 * POST { tags?: string[], paths?: string[] } with header `x-revalidate-secret: $REVALIDATE_SECRET`.
 * Lives outside /api because /api/* is rewritten to the backend.
 */
const ALLOWED_TAGS = new Set(["builder", "poetry", "catalog", "tenant", "seo"])

function authorized(given: string | null): boolean {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret || !given) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!authorized(req.headers.get("x-revalidate-secret"))) return Response.json({ ok: false }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown; paths?: unknown }
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string" && ALLOWED_TAGS.has(t)) : ["builder"]
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.startsWith("/")).slice(0, 50) : []
  for (const t of tags.length ? tags : ["builder"]) revalidateTag(t)
  for (const p of paths) revalidatePath(p)
  return Response.json({ ok: true, tags, paths }, { headers: { "Cache-Control": "no-store" } })
}
