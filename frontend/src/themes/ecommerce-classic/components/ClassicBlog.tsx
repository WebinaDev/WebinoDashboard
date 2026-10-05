import Link from "next/link"

import { sanitizeBuilderHtml } from "@/builder/render/sanitize-html"
import { formatDate, normalizeUiLocale } from "@/lib/locale"

type Post = {
  slug: string
  title: string
  excerpt?: string | null
  body?: string | null
  cover_url?: string | null
  published_at?: string | null
}

type ProductLite = {
  slug: string
  name: string
  image_url?: string | null
  cover_image_url?: string | null
}

function extractToc(body?: string | null): { label: string; href: string }[] {
  if (!body) return []
  const matches = Array.from(body.matchAll(/<h([2-3])[^>]*>(.*?)<\/h\1>/gi))
  return matches.slice(0, 12).map((match, index) => {
    const label = match[2]?.replace(/<[^>]+>/g, "").trim() || `بخش ${index + 1}`
    const href = `#section-${index + 1}`
    return { label, href }
  })
}

function injectHeadingIds(body?: string | null): string {
  if (!body) return ""
  let i = 0
  return body.replace(/<h([2-3])([^>]*)>/gi, (_full, level: string, attrs: string) => {
    i += 1
    if (/id=/.test(attrs)) return `<h${level}${attrs}>`
    return `<h${level}${attrs} id="section-${i}">`
  })
}

export function ClassicBlogArchive({
  title,
  emptyLabel,
  posts,
  locale,
}: {
  title: string
  emptyLabel: string
  posts: Post[]
  locale: string
}) {
  return (
    <div className="sf-blog-layout mx-auto max-w-6xl px-4 py-8">
      <header className="sf-section-head">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      </header>
      {!posts.length ? <p className="mt-8 text-sm text-muted-foreground">{emptyLabel}</p> : null}
      <div className="sf-blog-grid mt-8">
        {posts.map((post) => (
          <article key={post.slug} className="sf-blog-card">
            <Link href={`/blog/${post.slug}`} className="block overflow-hidden rounded-[1.25rem]">
              <div className="aspect-[16/10] bg-muted">
                {post.cover_url ? (
                  <img src={post.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-full place-items-center bg-gradient-to-br from-[var(--sf-pink-soft)] to-[var(--sf-navy-soft)] text-sm font-bold text-[var(--sf-navy)]">
                    {title}
                  </div>
                )}
              </div>
            </Link>
            <div className="mt-3 space-y-2">
              {post.published_at ? (
                <p className="text-xs text-muted-foreground">{formatDate(post.published_at, normalizeUiLocale(locale))}</p>
              ) : null}
              <h2 className="text-lg font-bold leading-7">
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              {post.excerpt ? <p className="line-clamp-3 text-sm leading-7 text-muted-foreground">{post.excerpt}</p> : null}
              <Link href={`/blog/${post.slug}`} className="inline-flex text-sm font-bold text-[var(--sf-pink)]">
                ادامه مطلب
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function ClassicBlogSingle({
  post,
  related,
  mostViewed,
  backHref,
  backLabel,
  locale,
}: {
  post: Post
  related: Post[]
  mostViewed: ProductLite[]
  backHref: string
  backLabel: string
  locale: string
}) {
  const toc = extractToc(post.body)
  const html = injectHeadingIds(post.body ?? post.excerpt)

  return (
    <div className="sf-blog-layout mx-auto max-w-6xl px-4 py-8">
      <nav className="sf-breadcrumb mb-4">
        <Link href="/">خانه</Link>
        <span aria-hidden> / </span>
        <Link href={backHref}>{backLabel}</Link>
        <span aria-hidden> / </span>
        <span>{post.title}</span>
      </nav>
      <div className="sf-blog-single">
        <article className="sf-blog-article">
          {post.cover_url ? (
            <div className="mb-6 overflow-hidden rounded-[1.75rem]">
              <img src={post.cover_url} alt="" className="aspect-[21/9] w-full object-cover" />
            </div>
          ) : null}
          <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">{post.title}</h1>
          {post.published_at ? (
            <p className="mt-2 text-sm text-muted-foreground">{formatDate(post.published_at, normalizeUiLocale(locale))}</p>
          ) : null}
          {post.excerpt ? <p className="mt-4 text-base leading-8 text-muted-foreground">{post.excerpt}</p> : null}
          <div
            className="sf-blog-prose mt-8 text-sm leading-8"
            dangerouslySetInnerHTML={{ __html: sanitizeBuilderHtml(html) }}
          />
          {related.length ? (
            <section className="mt-12">
              <div className="sf-section-head">
                <h2>مطالب مرتبط</h2>
              </div>
              <div className="sf-blog-grid">
                {related.map((item) => (
                  <Link key={item.slug} href={`/blog/${item.slug}`} className="sf-blog-card">
                    <h3 className="font-bold">{item.title}</h3>
                    {item.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</p> : null}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </article>
        <aside className="sf-blog-aside">
          {toc.length ? (
            <div className="sf-blog-toc sf-card p-4">
              <h3 className="mb-2 text-sm font-bold">فهرست مطالب</h3>
              {toc.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
          ) : null}
          <div className="sf-card mt-4 p-4">
            <div className="sf-section-head mb-3">
              <h3 className="text-sm font-bold">پربازدیدترین</h3>
            </div>
            <ul className="grid gap-3">
              {mostViewed.map((product) => (
                <li key={product.slug}>
                  <Link href={`/product/${product.slug}`} className="flex items-center gap-3">
                    <div className="size-12 overflow-hidden rounded-xl bg-muted">
                      {(product.cover_image_url || product.image_url) ? (
                        <img
                          src={product.cover_image_url || product.image_url || ""}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <span className="line-clamp-2 text-sm font-semibold">{product.name}</span>
                  </Link>
                </li>
              ))}
              {!mostViewed.length ? <li className="text-xs text-muted-foreground">—</li> : null}
            </ul>
          </div>
          <Link href={backHref} className="mt-4 inline-flex text-sm font-bold text-[var(--sf-pink)]">
            {backLabel}
          </Link>
        </aside>
      </div>
    </div>
  )
}
