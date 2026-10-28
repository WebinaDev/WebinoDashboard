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
