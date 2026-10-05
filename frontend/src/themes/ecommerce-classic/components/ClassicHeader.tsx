"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

import { cartCount, subscribeCart } from "@/builder/cart"
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
import { useDigits } from "./parts"

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
  const localCount = useSyncExternalStore(subscribeCart, cartCount, () => 0)
  const { cart, auth } = useServerCart()
  const count = auth === "auth" ? (cart?.items ?? []).reduce((sum, line) => sum + line.quantity, 0) : localCount
  const catalog = useCatalog(12)
  const { hidden, scrolled } = useNavReveal()
  const [query, setQuery] = useState("")
  const [mega, setMega] = useState(false)
  const [activeCat, setActiveCat] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const nav = links.length ? links : CLASSIC_NAV
  const categories = catalog.categories
  const active = categories[activeCat] ?? categories[0]
  const activeProducts = catalog.products
    .filter((p) => !active || p.categorySlug === active.slug || p.category === active.name)
    .slice(0, 6)

  const submit = () => {
    const q = query.trim()
    router.push(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop")
  }

  return (
    <>
      <header className={`sfc-header ${hidden ? "is-nav-hidden" : ""} ${scrolled ? "is-scrolled" : ""}`}>
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
              <form
                className="sfc-search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="جستجوی محصولات"
                  aria-label="جستجوی محصولات"
                />
                <button type="submit" aria-label="جستجو">
                  <IconSearch size={18} />
                </button>
              </form>
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
              <div
                className="sfc-mega"
                onMouseEnter={() => setMega(true)}
                onMouseLeave={() => setMega(false)}
              >
                <button type="button" className="sfc-mega__trigger" aria-expanded={mega} onClick={() => setMega((v) => !v)}>
                  <IconMenu size={20} />
                  <span>دسته بندی محصولات</span>
                </button>
                {mega && categories.length ? (
                  <div className="sfc-mega__panel" role="menu">
                    <ul className="sfc-mega__parents">
                      {categories.map((cat, index) => (
                        <li key={cat.slug}>
                          <Link
                            href={`/shop?category=${cat.slug}`}
                            className={index === activeCat ? "is-active" : ""}
                            onMouseEnter={() => setActiveCat(index)}
                            onClick={() => setMega(false)}
                          >
                            <span>{cat.name}</span>
                            <IconChevronLeft size={14} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <div className="sfc-mega__childs">
                      <Link href={`/shop?category=${active?.slug ?? ""}`} className="sfc-mega__all" onClick={() => setMega(false)}>
                        همه محصولات {active?.name}
                        <IconChevronLeft size={14} />
                      </Link>
                      <div className="sfc-mega__grid">
                        {activeProducts.map((p) => (
                          <Link key={p.slug} href={`/product/${p.slug}`} className="sfc-mega__item" onClick={() => setMega(false)}>
                            {p.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <span className="sfc-header__sep" aria-hidden="true" />
              <nav className="sfc-header__links" aria-label="منوی اصلی">
                {nav.map((link) => (
                  <Link key={link.href + link.label} href={link.href}>
                    <span className="sfc-header__link-icon">{navIcon(link.href, link.label)}</span>
                    <span>{link.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
            <div className="sfc-header__deals">
              <span className="sfc-header__sep" aria-hidden="true" />
              <Link href="/amazing-offers" className="sfc-deals">
                <span className="sfc-deals__title">شگفت انگیز</span>
                <span className="sfc-deals__badge">
                  <IconPercent size={12} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </header>
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
            <nav className="sfc-drawer__links">
              {categories.map((cat) => (
                <Link key={cat.slug} href={`/shop?category=${cat.slug}`} onClick={() => setDrawer(false)}>
                  {cat.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  )
}
