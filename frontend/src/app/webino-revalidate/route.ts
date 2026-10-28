import { timingSafeEqual } from "node:crypto"
import { revalidatePath, revalidateTag } from "next/cache"
import { purgeEdge } from "@/lib/edge-purge"

/**
 * On-demand cache purge, called by the backend after a builder page/global/theme save (all tenants).
 * POST { tags?: string[], paths?: string[] } with header `x-revalidate-secret: $REVALIDATE_SECRET`
 * (or, when no secret is set, a direct in-network call with no proxy forwarding headers).
 * Lives outside /api because /api/* is rewritten to the backend.
 */
const ALLOWED_TAGS = new Set(["builder", "poetry", "catalog", "tenant", "seo"])

function authorized(req: Request): boolean {
  const given = req.headers.get("x-revalidate-secret")
  const secret = process.env.REVALIDATE_SECRET
  // On by default: without a configured secret, accept only direct in-network calls from the backend
  // container. Anything that came through Caddy/edge carries forwarding headers and is rejected.
  if (!secret) {
    return !req.headers.get("x-forwarded-for") && !req.headers.get("x-forwarded-host") && !req.headers.get("x-real-ip")
  }
  if (!given) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ ok: false }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown; paths?: unknown; host?: unknown }
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string" && ALLOWED_TAGS.has(t)) : ["builder"]
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.startsWith("/")).slice(0, 50) : []
  for (const t of tags.length ? tags : ["builder"]) revalidateTag(t)
  for (const p of paths) revalidatePath(p)
  // Edge nginx keeps its own page cache; purge it too (no-op unless EDGE_PURGE_URL is set).
  const edge = await purgeEdge(paths, typeof body.host === "string" ? body.host : undefined)
  return Response.json({ ok: true, tags, paths, edge }, { headers: { "Cache-Control": "no-store" } })
}
