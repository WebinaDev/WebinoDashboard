# Cache headers: `X-Public-Cache` vs `X-Edge-Cache`

Two different caches, two different headers. Neither header is faked by the other layer.

| Header | Set by | Where it appears |
|---|---|---|
| `X-Public-Cache: HIT/MISS/BYPASS` | Laravel `App\Http\Middleware\CachePublicResponse` (`public.cache` middleware) | Only API routes that use it: `/api/v1/public/tenant`, `/site-status`, `/builder/pages/{slug}`, `/builder/templates`, `/builder/resolve`, `/builder/globals` |
| `X-Edge-Cache: HIT/MISS/...` | Edge nginx `proxy_cache pages` (`WebinoERP/docker/edge/nginx.conf`, 30s) | Storefront HTML pages served by Next.js |

So a storefront HTML page (e.g. `/`, `/shop`, a product page) only ever shows `X-Edge-Cache`.
`X-Public-Cache` on HTML would be wrong: Next.js never goes through `CachePublicResponse`.
The CDN does not strip it — check an API route directly:

```sh
curl -sI https://parisma.webinaagency.ir/api/v1/public/tenant | grep -i x-public-cache   # x-public-cache: HIT
curl -sI https://parisma.webinaagency.ir/ | grep -i x-edge-cache                       # x-edge-cache: HIT
```

The catalog API (`/api/v1/public/catalog*`) is not response-cached, so it has neither header.

## Purging the edge cache on revalidation

`POST /webino-revalidate` (called by the backend after builder/catalog/SEO saves) clears Next's data cache
with `revalidateTag`/`revalidatePath`, but that never reaches the edge nginx `proxy_cache pages`, so edited
products/categories could stay stale for up to the edge TTL. The route now also calls
`frontend/src/lib/edge-purge.ts`, which is a no-op unless configured:

| Env (frontend) | Default | Meaning |
|---|---|---|
| `EDGE_PURGE_URL` | unset (disabled) | Purge endpoint base, e.g. `http://edge:8080/purge`; the page path is appended |
| `EDGE_PURGE_METHOD` | `PURGE` | Method (ngx_cache_purge style); use `GET`/`POST` for a custom endpoint |
| `EDGE_PURGE_SECRET` | unset | Sent as `x-purge-secret`; the edge should reject requests without it |
| `EDGE_PURGE_ALL` | `/*` | Purged when only tags (no `paths`) were revalidated |

Optional body field `host` is forwarded as `x-purge-host` so the edge can build the per-tenant cache key.
Paths are sent percent-encoded (nginx keys on the raw URI), so Persian slugs purge correctly.
Example edge location (ngx_cache_purge):

```nginx
location ~ ^/purge(/.*) {
    allow 172.16.0.0/12; deny all;
    if ($http_x_purge_secret != "CHANGE_ME") { return 403; }
    proxy_cache_purge pages "$scheme$http_x_purge_host$1$is_args$args";
}
```

Without the purge module, an alternative is lowering the edge TTL or bumping a cache-key version;
until `EDGE_PURGE_URL` is set, edge pages expire on their normal 30s TTL.
