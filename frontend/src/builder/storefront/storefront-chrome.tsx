"use client"

import { Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState, type ReactNode } from "react"

import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import { useCatalog } from "./use-catalog"
import { quietApi } from "./session"
import type { ShopProduct } from "../catalog"

export function StorefrontBreadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="sf-breadcrumb" aria-label="breadcrumb">
      {items.map((item, index) => (
        <span key={item.label + index}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function StorefrontTopBar() {
  const t = useTranslations("storefront")
  return (
    <div className="sf-topbar hidden md:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <span>{t("footer_hours")}</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/amazing-offers">{t("amazing_offers_title")}</Link>
          <Link href="/compare">{t("compare_title")}</Link>
          <Link href="/shop?on_sale=1">{t("on_sale")}</Link>
        </div>
      </div>
    </div>
  )
}

export function StorefrontMobileNav({
  open,
  onClose,
  links,
}: {
  open: boolean
  onClose: () => void
  links: { label: string; href: string }[]
}) {
  const catalog = useCatalog(12)
  if (!open) return null
  return (
    <div className="sf-mobile-nav md:hidden" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="close" onClick={onClose} />
      <div className="sf-mobile-sheet">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold">منو</span>
          <button type="button" onClick={onClose} aria-label="close">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-xl bg-muted px-3 py-2 text-sm font-semibold" onClick={onClose}>
              {link.label}
            </Link>
          ))}
        </div>
        <p className="mb-2 mt-4 text-xs font-bold text-muted-foreground">دسته‌ها</p>
        <div className="grid gap-1">
          {catalog.categories.map((cat) => (
            <div key={cat.slug} className="grid gap-1">
              <Link href={`/shop?category=${cat.slug}`} className="text-sm font-semibold" onClick={onClose}>
                {cat.name}
              </Link>
              {(cat.children ?? []).slice(0, 6).map((child) => (
                <Link
                  key={child.slug}
                  href={`/shop?category=${child.slug}`}
                  className="ps-3 text-xs font-medium text-muted-foreground"
                  onClick={onClose}
                >
                  {child.name}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function StorefrontMegaMenuPanel({ columnsText }: { columnsText: string }) {
  const catalog = useCatalog(8)
  const lines = columnsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const parsed = lines.map((line) => {
    const [title, ...rest] = line.split("|")
    return { title: (title ?? "").trim(), links: rest.join("|").split(",").map((s) => s.trim()).filter(Boolean) }
  })

  if (!parsed.length) {
    const roots = catalog.categories
    return (
      <div className="sf-mega-panel grid gap-4 md:grid-cols-3">
        {roots.slice(0, 6).map((c) => (
          <div key={c.slug} className="sf-mega-col">
            <h3>
              <Link href={`/shop?category=${c.slug}`}>{c.name}</Link>
            </h3>
            {(c.children ?? []).slice(0, 8).map((child) => (
              <Link key={child.slug} href={`/shop?category=${child.slug}`}>
                {child.name}
              </Link>
            ))}
            {!(c.children ?? []).length ? (
              <Link href={`/shop?category=${c.slug}`}>مشاهده همه</Link>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="sf-mega-panel grid gap-4 md:grid-cols-3">
      {parsed.map((col) => (
        <div key={col.title} className="sf-mega-col">
          <h3>{col.title}</h3>
          {col.links.map((entry) => {
            const [label, href] = entry.includes("|") ? entry.split("|").map((s) => s.trim()) : [entry, "/shop"]
            return (
              <Link key={label + href} href={href || "/shop"}>
                {label}
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export type ProductReviewsOptions = {
  title?: string
  intro?: string
  showAverage?: boolean
  allowSubmit?: boolean
  submitLabel?: string
  emptyText?: string
  limit?: number
  editing?: boolean
}

type ReviewRow = { id: number; rating: number; body?: string | null; author_name?: string | null; voice_url?: string | null; likes_count?: number; dislikes_count?: number; created_at?: string }

const REVIEW_ERRORS: Record<number, string> = {
  401: "برای ثبت دیدگاه ابتدا وارد حساب خود شوید.",
  403: "فقط خریداران این محصول می‌توانند دیدگاه ثبت کنند.",
  429: "درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
}

/** Write-review form: star rating + text, posting to the public reviews API. */
function ReviewForm({ slug, label, editing, onDone }: { slug: string; label: string; editing: boolean; onDone: (pending: boolean) => void }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [body, setBody] = useState("")
  const [author, setAuthor] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (editing) return
    if (rating < 1) return setError("امتیاز را انتخاب کنید.")
    setSending(true)
    setError("")
    const res = await quietApi<{ data?: { status?: string } }>(`/api/v1/public/catalog/items/${encodeURIComponent(slug)}/reviews`, {
      method: "POST",
      json: { rating, body: body.trim() || null, author_name: author.trim() || null },
    })
    setSending(false)
    if (res.ok) {
      setRating(0)
      setBody("")
      onDone(res.data?.data?.status !== "approved")
    } else setError(res.message === "reviews_disabled" ? "ثبت دیدگاه برای این فروشگاه غیرفعال است." : REVIEW_ERRORS[res.status] ?? (res.message || "ثبت دیدگاه ناموفق بود."))
  }
  return (
    <form dir="rtl" onSubmit={submit} className="sf-review-card grid gap-3" aria-label="نوشتن دیدگاه">
      <div role="radiogroup" aria-label="امتیاز" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n.toLocaleString("fa-IR")} ستاره`}
            className={`text-2xl leading-none ${(hover || rating) >= n ? "text-primary" : "text-muted-foreground/40"}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <input className="h-10 rounded-xl border border-border bg-background px-3 text-sm" placeholder="نام شما (اختیاری)" maxLength={120} value={author} onChange={(e) => setAuthor(e.target.value)} />
      <textarea className="min-h-24 rounded-xl border border-border bg-background p-3 text-sm" placeholder="تجربه خود از این محصول را بنویسید" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <button type="submit" disabled={sending} className="h-10 justify-self-start rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
        {sending ? "در حال ارسال…" : label}
      </button>
    </form>
  )
}

export function ProductReviewsPanel({ slug, options = {} }: { slug: string; options?: ProductReviewsOptions }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const [items, setItems] = useState<ReviewRow[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState("")
  const showAverage = options.showAverage ?? true
  const limit = Math.max(0, options.limit ?? 0)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}/reviews`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setItems(Array.isArray(json?.data?.items) ? json.data.items : [])
        setAverage(typeof json?.data?.average === "number" ? json.data.average : null)
      })
      .catch(() => undefined)
  }, [slug, reload])

  const visible = limit ? items.slice(0, limit) : items
  return (
    <section className="mt-6" id="sfc-reviews">
      <div className="sf-section-head">
        <h2>{options.title || t("reviews_title")}</h2>
        {showAverage && average != null ? (
          <span className="text-sm font-bold text-primary">
            {formatNumber(average, normalizeUiLocale(locale))} / ۵
            {items.length ? <span className="ms-1 text-xs font-normal text-muted-foreground">({formatNumber(items.length, normalizeUiLocale(locale))} دیدگاه)</span> : null}
          </span>
        ) : null}
      </div>
      {options.intro ? <p className="mb-3 text-sm text-muted-foreground">{options.intro}</p> : null}
      <div className="grid gap-3">
        {visible.map((review) => (
          <article key={review.id} className="sf-review-card">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">{review.author_name || t("account_login")}</strong>
              <span className="text-xs text-muted-foreground">
                {review.created_at ? formatDate(review.created_at, normalizeUiLocale(locale)) : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-primary" aria-label={`${review.rating} از ۵`}>{"★".repeat(Math.max(0, Math.min(5, review.rating)))}</p>
            {review.body ? <p className="mt-2 text-sm leading-7">{review.body}</p> : null}
            {review.voice_url ? (
              <audio controls className="mt-2 w-full max-w-md" preload="none">
                <source src={review.voice_url} />
              </audio>
            ) : null}
            <div className="sf-review-actions">
              <button type="button" onClick={() => void quietApi(`/api/v1/public/catalog/reviews/${review.id}/react`, { method: "POST", json: { reaction: "like" } })}>
                👍 {review.likes_count ?? 0}
              </button>
              <button type="button" onClick={() => void quietApi(`/api/v1/public/catalog/reviews/${review.id}/react`, { method: "POST", json: { reaction: "dislike" } })}>
                👎 {review.dislikes_count ?? 0}
              </button>
              <button type="button" onClick={() => void quietApi(`/api/v1/public/catalog/reviews/${review.id}/report`, { method: "POST", json: {} })}>
                {t("review_report")}
              </button>
            </div>
          </article>
        ))}
        {!items.length ? <p className="text-sm text-muted-foreground">{options.emptyText || t("empty_none")}</p> : null}
        {notice ? <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm text-primary">{notice}</p> : null}
        {options.allowSubmit ? (
          <ReviewForm
            slug={slug}
            label={options.submitLabel || "ثبت دیدگاه"}
            editing={Boolean(options.editing)}
            onDone={(pending) => {
              setNotice(pending ? "دیدگاه شما ثبت شد و پس از تأیید نمایش داده می‌شود." : "دیدگاه شما ثبت شد.")
              setReload((n) => n + 1)
            }}
          />
        ) : null}
      </div>
    </section>
  )
}

export function StockAlertForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront")
  const [destination, setDestination] = useState("")
  const [note, setNote] = useState("")
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void quietApi(`/api/v1/public/catalog/items/${encodeURIComponent(slug)}/stock-alerts`, {
          method: "POST",
          json: { alert_type: "back_in_stock", channel: "email", destination },
        }).then((res) => setNote(res.ok ? t("added") : t("add_failed")))
      }}
    >
      <label className="grid flex-1 gap-1 text-xs">
        <span>{t("stock_alert_cta")}</span>
        <input className="sf-field h-10" dir="ltr" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="email@example.com" />
      </label>
      <button type="submit" className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
        {t("stock_alert_cta")}
      </button>
      {note ? <p className="w-full text-xs text-muted-foreground">{note}</p> : null}
    </form>
  )
}

export function StorefrontAccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations("storefront")
  const pathname = usePathname()
  const links = [
    { href: "/account", label: t("account_orders") },
    { href: "/dashboard/account/favorites", label: t("favorite") },
    { href: "/dashboard/account/profile", label: t("account_password") },
    { href: "/dashboard/account/wallet", label: t("pay_title") },
    { href: "/compare", label: t("compare_title") },
  ]
  return (
    <div className="sf-account-shell">
      <nav className="sf-account-nav" aria-label="account">
        {links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  )
}

export function StorefrontProductCardActions({ product }: { product: ShopProduct }) {
  const t = useTranslations("storefront")
  if (!product.id) return null
  return (
    <div className="mt-2 flex gap-1">
      <button
        type="button"
        className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold"
        onClick={() => void quietApi(`/api/v1/public/compare/products/${product.id}`, { method: "POST" })}
      >
        {t("compare_add")}
      </button>
    </div>
  )
}

export function MobileNavToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="grid size-10 place-items-center rounded-full bg-muted md:hidden" aria-label="menu" onClick={onOpen}>
      <Menu className="size-4" />
    </button>
  )
}

export function StorefrontPageShell({
  title,
  description,
  trail,
  children,
  wide,
}: {
  title: string
  description?: string
  trail: { label: string; href?: string }[]
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={`sf-secondary-page mx-auto px-4 py-8 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>
      <StorefrontBreadcrumbs items={trail} />
      <header className="sf-section-head mt-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  )
}

type PublicQuestion = { id: number; body: string; answer: string; author_name?: string | null; answered_at?: string | null }

/** PDP questions & answers: answered questions are public, new ones go to admin moderation. */
export function ProductQuestionsPanel({ slug }: { slug: string }) {
  const t = useTranslations("storefront")
  const locale = useLocale()
  const [items, setItems] = useState<PublicQuestion[]>([])
  const [productId, setProductId] = useState<number | null>(null)
  const [body, setBody] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "sent" | "login" | "error">("idle")

  useEffect(() => {
    void quietApi<{ data?: { product_id?: number; items?: PublicQuestion[] } }>(
      `/api/v1/public/catalog/items/${encodeURIComponent(slug)}/questions`,
    ).then((res) => {
      if (!res.ok) return
      setItems(Array.isArray(res.data?.data?.items) ? res.data.data.items : [])
      setProductId(typeof res.data?.data?.product_id === "number" ? res.data.data.product_id : null)
    })
  }, [slug])

  async function submit() {
    if (productId == null || body.trim().length < 3) return
    setState("sending")
    const res = await quietApi("/api/v1/account/questions", { method: "POST", json: { product_id: productId, body: body.trim() } })
    if (res.ok) {
      setBody("")
      setState("sent")
    } else {
      setState(res.status === 401 || res.status === 403 ? "login" : "error")
    }
  }

  return (
    <section className="mt-6" id="sfc-questions">
      <div className="sf-section-head">
        <h2>{t("questions_title")}</h2>
      </div>
      <div className="grid gap-3">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{t("questions_empty")}</p> : null}
        {items.map((q) => (
          <article key={q.id} className="sf-review-card">
            <p className="text-sm font-bold leading-7">{q.body}</p>
            <p className="mt-2 border-s-2 border-primary/40 ps-3 text-sm leading-7">{q.answer}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {q.author_name || t("questions_customer")}
              {q.answered_at ? ` · ${formatDate(q.answered_at, normalizeUiLocale(locale))}` : ""}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        <label className="text-sm font-bold" htmlFor={`sfc-q-${slug}`}>{t("questions_ask")}</label>
        <textarea
          id={`sfc-q-${slug}`}
          className="min-h-20 rounded-xl border bg-background p-3 text-sm"
          maxLength={2000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="sf-btn sf-btn--primary" disabled={state === "sending" || body.trim().length < 3 || productId == null} onClick={() => void submit()}>
            {t("questions_submit")}
          </button>
          {state === "sent" ? <span className="text-xs text-primary">{t("questions_sent")}</span> : null}
          {state === "login" ? <Link className="text-xs text-primary underline" href="/account">{t("questions_login")}</Link> : null}
          {state === "error" ? <span className="text-xs text-destructive">{t("questions_error")}</span> : null}
        </div>
      </div>
    </section>
  )
}
