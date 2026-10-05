"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"

import { cartCount, subscribeCart } from "@/builder/cart"
import { type ShopCategory, type ShopProduct } from "@/builder/catalog"
import { useServerCart } from "@/builder/storefront/actions"
import { useCatalog } from "@/builder/storefront/use-catalog"

import {
  IconBag,
  IconBook,
  IconChevronLeft,
  IconHome,
  IconInfo,
  IconMail,
  IconMenu,
  IconPercent,
  IconQuestion,
  IconSearch,
  IconUser,
} from "./icons"
import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import { ClassicAmount, useDigits } from "./parts"

export const CLASSIC_NAV = [
  { label: "خانه", href: "/" },
  { label: "فروشگاه", href: "/shop" },
  { label: "مجله", href: "/blog" },
  { label: "سوالات متداول", href: "/pages/faq" },
  { label: "تماس با ما", href: "/pages/contact" },
  { label: "درباره ما", href: "/pages/about" },
]

function navIcon(href: string, label: string): ReactNode {
  const key = `${href} ${label}`
  if (href === "/") return <IconHome size={16} />
  if (/blog|مجله/.test(key)) return <IconBook size={16} />
  if (/faq|سوال/.test(key)) return <IconQuestion size={16} />
  if (/contact|تماس/.test(key)) return <IconMail size={16} />
  if (/about|درباره/.test(key)) return <IconUser size={16} />
  if (/shop|فروشگاه/.test(key)) return <IconBag size={16} />
  return <IconInfo size={16} />
}

/** Hide the category/nav row on scroll-down, reveal on scroll-up (classic sticky header). */
function useNavReveal() {
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const last = useRef(0)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - last.current
        setScrolled(y > 8)
        if (y < 120) setHidden(false)
        else if (delta > 6) setHidden(true)
        else if (delta < -6) setHidden(false)
        last.current = y
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
    }
  }, [])
  return { hidden, scrolled }
}

function megaGridStyle(count: number): CSSProperties {
  const columns = Math.min(4, Math.max(1, Math.ceil(count / 8)))
  const rows = Math.min(10, Math.max(1, Math.ceil(count / columns)))
  return {
    ["--megamenu-columns" as string]: String(columns),
    ["--megamenu-rows" as string]: String(rows),
  }
}

function MegaChildList({
  items,
  onNavigate,
}: {
  items: ShopCategory[]
  onNavigate: () => void
}) {
  if (!items.length) return null
  return (
    <ul className="sfc-mega__level2" style={megaGridStyle(items.length)}>
      {items.map((child) => {
        const grand = child.children ?? []
        return (
          <li key={child.slug} className={`sfc-mega__l2 ${grand.length ? "has-kids" : ""}`}>
            <Link href={`/shop?category=${child.slug}`} className="sfc-mega__l2-link" onClick={onNavigate}>
              {child.name}
            </Link>
            {grand.length ? (
              <ul className="sfc-mega__level3">
                {grand.map((g) => (
                  <li key={g.slug}>
                    <Link href={`/shop?category=${g.slug}`} onClick={onNavigate}>
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function DeepMegaPanel({
  categories,
  activeCat,
  setActiveCat,
  onClose,
}: {
  categories: ShopCategory[]
  activeCat: number
  setActiveCat: (i: number) => void
  onClose: () => void
}) {
  const active = categories[activeCat] ?? categories[0]
  const children = active?.children ?? []

  return (
    <div className="sfc-mega__panel" role="menu" aria-label="دسته‌بندی محصولات">
      <ul className="sfc-mega__parents" role="tablist">
        {categories.map((cat, index) => (
          <li key={cat.slug} role="none">
            <Link
              href={`/shop?category=${cat.slug}`}
              role="tab"
              aria-selected={index === activeCat}
              className={index === activeCat ? "is-active" : ""}
              onMouseEnter={() => setActiveCat(index)}
              onFocus={() => setActiveCat(index)}
              onClick={onClose}
            >
              <span className="sfc-mega__parent-label">
                {cat.image ? <img src={cat.image} alt="" width={24} height={24} /> : null}
                <span>{cat.name}</span>
              </span>
              <IconChevronLeft size={14} />
            </Link>
          </li>
        ))}
      </ul>
      <div className="sfc-mega__childs">
        <Link href={`/shop?category=${active?.slug ?? ""}`} className="sfc-mega__all" onClick={onClose}>
          همه محصولات {active?.name}
          <IconChevronLeft size={14} />
        </Link>
        {children.length ? (
          <MegaChildList items={children} onNavigate={onClose} />
        ) : (
          <p className="sfc-mega__empty">زیردسته‌ای برای این گروه ثبت نشده است.</p>
        )}
      </div>
    </div>
  )
}

function LiveSearch({
  query,
  setQuery,
  products,
  onSubmit,
  placeholder,
  ajax,
  searchSku,
  titleOnly,
}: {
  query: string
  setQuery: (v: string) => void
  products: ShopProduct[]
  onSubmit: () => void
  placeholder?: string
  ajax?: boolean
  searchSku?: boolean
  titleOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLFormElement>(null)
  const q = query.trim().toLowerCase()
  const hits = useMemo(() => {
    if (!ajax || q.length < 1) return []
    return products
      .filter((p) => {
        const name = p.name.toLowerCase()
        if (titleOnly) return name.includes(q)
        const sku = String((p as { sku?: string }).sku ?? "").toLowerCase()
        return (
          name.includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (searchSku && sku.includes(q))
        )
      })
      .slice(0, 6)
  }, [products, q, ajax, searchSku, titleOnly])

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <form
      ref={wrap}
      className="sfc-search"
      role="search"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        setOpen(false)
        onSubmit()
      }}
    >
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "جستجوی محصولات"}
        aria-label={placeholder || "جستجوی محصولات"}
        aria-autocomplete="list"
        aria-expanded={open && hits.length > 0}
      />
      <button type="submit" aria-label="جستجو">
        <IconSearch size={18} />
      </button>
      {open && hits.length ? (
        <div className="sfc-search__suggest" role="listbox">
          {hits.map((p) => (
            <Link
              key={p.slug}
              href={`/product/${p.slug}`}
              role="option"
              className="sfc-search__hit"
              onClick={() => setOpen(false)}
            >
              <span className="sfc-search__hit-img">
                {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span>{p.name.slice(0, 1)}</span>}
              </span>
              <span className="sfc-search__hit-body">
                <strong>{p.name}</strong>
                <span>{p.brand}</span>
              </span>
              <ClassicAmount value={p.price} />
            </Link>
          ))}
          <button
            type="button"
            className="sfc-search__all"
            onClick={() => {
              setOpen(false)
              onSubmit()
            }}
          >
            مشاهده همه نتایج
          </button>
        </div>
      ) : null}
    </form>
  )
}

export function ClassicHeader({
  siteName,
  logoUrl,
  links,
}: {
  siteName: string
  logoUrl?: string | null
  links: { label: string; href: string }[]
}) {
  const digits = useDigits()
  const router = useRouter()
  const theme = useClassicThemeSettings()
  const headerCfg = theme.header ?? {}
  const megaEnabled = headerCfg.mega_menu ?? theme.mega_menu ?? true
  const stickyDesktop = headerCfg.sticky_desktop !== false
  const localCount = useSyncExternalStore(subscribeCart, cartCount, () => 0)
  const { cart, auth } = useServerCart()
  const count = auth === "auth" ? (cart?.items ?? []).reduce((sum, line) => sum + line.quantity, 0) : localCount
  const catalog = useCatalog(24)
  const { hidden, scrolled } = useNavReveal()
  const [query, setQuery] = useState("")
  const [mega, setMega] = useState(false)
  const [activeCat, setActiveCat] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState<string | null>(null)
  const megaRef = useRef<HTMLDivElement>(null)
  const nav = links.length ? links : CLASSIC_NAV
  const categories = catalog.categories

  const submit = () => {
    const q = query.trim()
    router.push(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop")
  }

  useEffect(() => {
    if (!mega) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMega(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mega])

  const onMegaKey = (event: ReactKeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setMega((v) => !v)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setMega(true)
    } else if (event.key === "Escape") {
      setMega(false)
    }
  }

  return (
    <>
      <header className={`sfc-header ${stickyDesktop ? "is-sticky-desktop" : "is-static-desktop"} ${hidden ? "is-nav-hidden" : ""} ${scrolled ? "is-scrolled" : ""}`}>
        <div className="sfc-header__top">
          <div className="sfc-container sfc-header__top-inner">
            <div className="sfc-header__brand-search">
              <button type="button" className="sfc-header__burger" aria-label="منو" onClick={() => setDrawer(true)}>
                <IconMenu size={22} />
              </button>
              <Link href="/" className="sfc-header__logo" aria-label={siteName}>
                {logoUrl ? <img src={logoUrl} alt={siteName} /> : <span className="sfc-header__mark">{siteName.slice(0, 1)}</span>}
                {!logoUrl ? <span className="sfc-header__name">{siteName}</span> : null}
              </Link>
              <LiveSearch
                query={query}
                setQuery={setQuery}
                products={catalog.products}
                onSubmit={submit}
                placeholder={headerCfg.search_placeholder}
                ajax={headerCfg.ajax_search !== false}
                searchSku={Boolean(headerCfg.search_sku)}
                titleOnly={Boolean(headerCfg.search_title_only)}
              />
            </div>
            <div className="sfc-header__actions">
              <div className="sfc-login-wrap">
                <span className="sfc-login-wrap__shadow" aria-hidden="true" />
                <Link href={auth === "auth" ? "/account" : "/login"} className="sfc-login">
                  <IconUser size={20} />
                  <span className="sfc-login__text">{auth === "auth" ? "حساب کاربری" : "ورود و عضویت"}</span>
                </Link>
              </div>
              <Link href="/cart" className="sfc-cart-btn" aria-label="سبد خرید">
                <span className="sfc-cart-btn__title">سبد خرید</span>
                <span className="sfc-cart-btn__count">{count > 0 ? digits(count) : ":)"}</span>
              </Link>
            </div>
          </div>
        </div>
        <div className="sfc-header__nav" aria-hidden={hidden || undefined}>
          <div className="sfc-container sfc-header__nav-inner">
            <div className="sfc-header__nav-main">
              {megaEnabled ? (
                <div
                  ref={megaRef}
                  className={`sfc-mega ${mega ? "is-open" : ""}`}
                  onMouseEnter={() => setMega(true)}
                  onMouseLeave={() => setMega(false)}
                >
                  <button
                    type="button"
                    className="sfc-mega__trigger"
                    aria-expanded={mega}
                    aria-haspopup="true"
                    onClick={() => setMega((v) => !v)}
                    onKeyDown={onMegaKey}
                  >
                    <IconMenu size={20} />
                    <span>{headerCfg.mega_menu_title || "دسته‌بندی محصولات"}</span>
                  </button>
                  {mega && categories.length ? (
                    <DeepMegaPanel
                      categories={categories}
                      activeCat={activeCat}
                      setActiveCat={setActiveCat}
                      onClose={() => setMega(false)}
                    />
                  ) : null}
                </div>
              ) : null}
              {megaEnabled ? <span className="sfc-header__sep" aria-hidden="true" /> : null}
              <nav className="sfc-header__links" aria-label="منوی اصلی">
                {nav.map((link) => (
                  <Link key={link.href + link.label} href={link.href}>
                    <span className="sfc-header__link-icon">{navIcon(link.href, link.label)}</span>
                    <span>{link.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
            {headerCfg.deals_enabled !== false ? (
              <div className="sfc-header__deals">
                <span className="sfc-header__sep" aria-hidden="true" />
                <Link href={headerCfg.deals_link || "/amazing-offers"} className="sfc-deals">
                  <span className="sfc-deals__title">{headerCfg.deals_title || "شگفت انگیز"}</span>
                  {headerCfg.deals_subtitle ? (
                    <span className="sfc-deals__sub">{headerCfg.deals_subtitle}</span>
                  ) : null}
                  <span className="sfc-deals__badge">
                    <IconPercent size={12} />
                  </span>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {headerCfg.banner_enabled ? (
        <div
          className="sfc-header-banner"
          style={{
            background: headerCfg.banner_bg || "#021959",
            color: headerCfg.banner_text_color || "#ffffff",
          }}
        >
          <div className="sfc-container sfc-header-banner__inner">
            {headerCfg.banner_link ? (
              <a href={headerCfg.banner_link} className="sfc-header-banner__link">
                {headerCfg.banner_image_desktop ? (
                  <img
                    className="sfc-header-banner__img sfc-header-banner__img--desktop"
                    src={headerCfg.banner_image_desktop}
                    alt=""
                  />
                ) : null}
                {headerCfg.banner_image_mobile ? (
                  <img
                    className="sfc-header-banner__img sfc-header-banner__img--mobile"
                    src={headerCfg.banner_image_mobile}
                    alt=""
                  />
                ) : null}
                {headerCfg.banner_text ? <span>{headerCfg.banner_text}</span> : null}
              </a>
            ) : (
              <>
                {headerCfg.banner_image_desktop ? (
                  <img
                    className="sfc-header-banner__img sfc-header-banner__img--desktop"
                    src={headerCfg.banner_image_desktop}
                    alt=""
                  />
                ) : null}
                {headerCfg.banner_text ? <span>{headerCfg.banner_text}</span> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
      {drawer ? (
        <div className="sfc-drawer" role="dialog" aria-modal="true">
          <button type="button" className="sfc-drawer__scrim" aria-label="بستن" onClick={() => setDrawer(false)} />
          <div className="sfc-drawer__sheet">
            <div className="sfc-drawer__head">
              <strong>{siteName}</strong>
              <button type="button" onClick={() => setDrawer(false)} aria-label="بستن">
                ×
              </button>
            </div>
            <nav className="sfc-drawer__links">
              {nav.map((link) => (
                <Link key={link.href + link.label} href={link.href} onClick={() => setDrawer(false)}>
                  {navIcon(link.href, link.label)}
                  {link.label}
                </Link>
              ))}
            </nav>
            <p className="sfc-drawer__label">دسته بندی محصولات</p>
            <nav className="sfc-drawer__links sfc-drawer__cats">
              {categories.map((cat) => {
                const open = drawerOpen === cat.slug
                const kids = cat.children ?? []
                return (
                  <div key={cat.slug} className="sfc-drawer__cat">
                    <div className="sfc-drawer__cat-row">
                      <Link href={`/shop?category=${cat.slug}`} onClick={() => setDrawer(false)}>
                        {cat.name}
                      </Link>
                      {kids.length ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label="زیرمجموعه‌ها"
                          onClick={() => setDrawerOpen(open ? null : cat.slug)}
                        >
                          {open ? "−" : "+"}
                        </button>
                      ) : null}
                    </div>
                    {open ? (
                      <div className="sfc-drawer__sub">
                        {kids.map((child) => (
                          <Link key={child.slug} href={`/shop?category=${child.slug}`} onClick={() => setDrawer(false)}>
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  )
}
