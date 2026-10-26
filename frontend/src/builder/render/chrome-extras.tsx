"use client"

/* Shared header/footer extras (settings in ../registry-chrome-extras.ts), used by site-header,
 * poetry-nav, site-footer, poetry-footer and poetry-site-footer. Everything is opt-in. */

import { ShoppingBag, User } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { CSSProperties } from "react"
import type React from "react"

import { useAfterLoad } from "@/components/perf/AfterLoadHtml"
import { cartCount, subscribeCart } from "../cart"
import { parseRows, propBool, propNum, propStr } from "../props"
import { useServerCart } from "../storefront/actions"
import { quietApi } from "../storefront/session"
import "./chrome-extras.css"

type P = Record<string, unknown>
const CSS_SAFE = /^[#a-z0-9(),.\s%-]+$/i
const href = (v: string, fb = "#") => (/^(https?:|mailto:|tel:|\/|#)/i.test((v || "").trim()) ? v.trim() : fb)
const fa = (n: number) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])

/* ───────── nav: cart badge + login / account ───────── */
export function navExtrasOn(p: P) { return propBool(p, "showCart", false) || propBool(p, "showAccount", false) }

export function NavExtras({ p }: { p: P }) {
  if (!navExtrasOn(p)) return null
  return <NavExtrasInner p={p} />
}

function NavExtrasInner({ p }: { p: P }) {
  const local = useSyncExternalStore(subscribeCart, cartCount, () => 0)
  const { cart, auth } = useServerCart()
  const server = (cart?.items ?? []).reduce((s, l) => s + l.quantity, 0)
  const count = auth === "auth" ? server : local
  const links = parseRows(p.accountLinks, ["label", "href"]).filter((l) => l.label)
  const logout = async () => {
    await quietApi("/api/v1/auth/logout", { method: "POST" })
    window.location.href = "/"
  }
  const menu = links.length ? links : [{ label: "حساب کاربری", href: "/account" }]
  return (
    <div className="wbx-nav-extras">
      {propBool(p, "showCart", false) ? (
        <Link href={href(propStr(p, "cartHref", "/cart"), "/cart")} className="wbx-cart" aria-label={`سبد خرید، ${fa(count)} کالا`}>
          <ShoppingBag size={20} aria-hidden />
          {count > 0 ? <span className="wbx-badge">{fa(count > 99 ? 99 : count)}</span> : null}
        </Link>
      ) : null}
      {propBool(p, "showAccount", false) ? (auth === "auth" ? (
        <details className="wbx-account">
          <summary aria-label="حساب کاربری"><User size={20} aria-hidden /></summary>
          <div className="wbx-account-menu" role="menu">{menu.map((l, i) => <Link key={i} role="menuitem" href={href(l.href, "/account")}>{l.label}</Link>)}
            {propBool(p, "showLogout", true) ? <button type="button" role="menuitem" className="wbx-logout" onClick={() => void logout()}>{propStr(p, "logoutLabel", "خروج")}</button> : null}</div>
        </details>
      ) : (
        <Link href={href(propStr(p, "loginHref", "/login"), "/login")} className="wbx-login">{propStr(p, "loginLabel", "ورود")}</Link>
      )) : null}
    </div>
  )
}

/* ───────── footer: background pattern, overlay, full bleed ───────── */
export function footerExtraClass(p: P): string {
  const c: string[] = ["wbx-foot"]
  if (propStr(p, "footerPattern")) c.push("wbx-has-pattern")
  if (propStr(p, "footerOverlay")) c.push("wbx-has-overlay")
  if (propBool(p, "footerFullBleed", false)) c.push("wbx-bleed")
  return c.join(" ")
}

export function footerExtraStyle(p: P): CSSProperties {
  const v: Record<string, string> = {}
  const img = propStr(p, "footerPattern").replace(/["\\()]/g, "")
  if (img && /^(https?:\/\/|\/)/.test(img)) {
    v["--wbx-pat"] = `url("${img}")`
    const rep = propStr(p, "footerPatternRepeat", "repeat")
    v["--wbx-pat-rep"] = ["repeat", "repeat-x", "repeat-y", "no-repeat"].includes(rep) ? rep : "repeat"
    const size = propStr(p, "footerPatternSize", "240px")
    v["--wbx-pat-size"] = /^(auto|cover|contain|\d{1,4}px)$/.test(size) ? size : "240px"
    const pos = propStr(p, "footerPatternPosition", "center")
    v["--wbx-pat-pos"] = ["center", "top", "bottom", "right", "left"].includes(pos) ? pos : "center"
    v["--wbx-pat-op"] = String(Math.max(0, Math.min(100, propNum(p, "footerPatternOpacity", 12))) / 100)
  }
  const ov = propStr(p, "footerOverlay")
  if (ov && CSS_SAFE.test(ov)) {
    v["--wbx-ov"] = ov
    v["--wbx-ov-op"] = String(Math.max(0, Math.min(100, propNum(p, "footerOverlayOpacity", 60))) / 100)
  }
  const cb = propStr(p, "copyrightBg")
  if (cb && CSS_SAFE.test(cb)) v["--wbx-copy-bg"] = cb
  return v as CSSProperties
}

/* ───────── footer: extra columns (occasions, contact, newsletter) ───────── */
export function FooterExtraColumns({ p }: { p: P }) {
  const occ = parseRows(p.footerOccasions, ["label", "href"]).filter((l) => l.label)
  const phone = propStr(p, "footerPhone"), email = propStr(p, "footerEmail"), addr = propStr(p, "footerAddress")
  const news = propBool(p, "footerNewsletter", false)
  if (!occ.length && !phone && !email && !addr && !news) return null
  return (
    <div className="wbx-foot-cols" dir="rtl">
      {occ.length ? <div><b className="wbx-col-title">{propStr(p, "footerOccasionsTitle", "مناسبت‌ها")}</b><ul>{occ.map((l, i) => <li key={i}><Link href={href(l.href, "/")}>{l.label}</Link></li>)}</ul></div> : null}
      {phone || email || addr ? <div><b className="wbx-col-title">{propStr(p, "footerContactTitle", "تماس")}</b><ul>
        {phone ? <li><a href={`tel:${phone.replace(/[^\d+]/g, "")}`} dir="ltr">{phone}</a></li> : null}
        {email ? <li><a href={`mailto:${email}`} dir="ltr">{email}</a></li> : null}
        {addr ? <li>{addr}</li> : null}
      </ul></div> : null}
      {news ? <FooterNewsletter p={p} /> : null}
    </div>
  )
}

function FooterNewsletter({ p }: { p: P }) {
  const [v, setV] = useState("")
  const [st, setSt] = useState<"idle" | "sending" | "done" | "error">("idle")
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const x = v.trim()
    if (!x) return
    setSt("sending")
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/public/newsletter/subscribe`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(x.includes("@") ? { email: x, source: "footer" } : { phone: x, source: "footer" }),
    }).then((r) => setSt(r.ok ? "done" : "error")).catch(() => setSt("error"))
  }
  const ph = propStr(p, "footerNewsletterPlaceholder", "ایمیل یا شماره موبایل")
  return (
    <div className="wbx-news">
      <b className="wbx-col-title">{propStr(p, "footerNewsletterTitle", "خبرنامه")}</b>
      {propStr(p, "footerNewsletterText") ? <p>{propStr(p, "footerNewsletterText")}</p> : null}
      <form onSubmit={submit} noValidate>
        <input dir="ltr" value={v} onChange={(e) => setV(e.target.value)} placeholder={ph} aria-label={ph} />
        <button type="submit" disabled={st === "sending"}>{propStr(p, "footerNewsletterButton", "عضویت")}</button>
      </form>
      <small aria-live="polite">{st === "done" ? "عضویت شما ثبت شد." : st === "error" ? "ثبت انجام نشد؛ دوباره تلاش کنید." : ""}</small>
    </div>
  )
}

/* ───────── footer: trust seal slider (admin embed codes, sanitized, after page load) ───────── */
const ALLOWED_TAGS = new Set(["A", "IMG", "SPAN", "DIV", "PICTURE", "SOURCE"])
const ALLOWED_ATTRS = new Set(["href", "src", "srcset", "alt", "title", "width", "height", "target", "rel", "referrerpolicy", "id", "code", "class"])

/** Keep only links and images (no scripts, iframes, inline handlers or javascript: URLs). */
export function sanitizeSealHtml(html: string): string {
  if (typeof DOMParser === "undefined") return ""
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html")
  const root = doc.body.firstElementChild
  if (!root) return ""
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!ALLOWED_TAGS.has(child.tagName)) { child.remove(); continue }
      for (const a of Array.from(child.attributes)) {
        const n = a.name.toLowerCase()
        if (!ALLOWED_ATTRS.has(n) || ((n === "href" || n === "src" || n === "srcset") && !/^\s*(https?:|\/)/i.test(a.value))) child.removeAttribute(a.name)
      }
      if (child.tagName === "A") { child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer") }
      if (child.tagName === "IMG") { child.setAttribute("loading", "lazy"); if (!child.getAttribute("referrerpolicy")) child.setAttribute("referrerpolicy", "origin") }
      walk(child)
    }
  }
  walk(root)
  return root.innerHTML
}

export function splitSeals(raw: unknown): string[] {
  return String(raw ?? "").split(/^\s*###\s*$/m).map((s) => s.trim()).filter(Boolean)
}

export function TrustSealSlider({ p }: { p: P }) {
  const codes = splitSeals(p.trustSeals)
  const ready = useAfterLoad()
  const track = useRef<HTMLDivElement | null>(null)
  const [safe, setSafe] = useState<string[]>([])
  useEffect(() => { if (ready) setSafe(codes.map(sanitizeSealHtml).filter(Boolean)) }, [ready, String(p.trustSeals ?? "")]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = track.current
    if (!el || safe.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = window.setInterval(() => {
      if (document.hidden || el.scrollWidth <= el.clientWidth + 4) return
      const step = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 120
      const end = Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 4
      el.scrollTo({ left: end ? 0 : el.scrollLeft - step - 12, behavior: "smooth" })
    }, 3500)
    return () => window.clearInterval(t)
  }, [safe.length])
  if (!codes.length) return null
  return (
    <div className="wbx-seals" dir="rtl">
      {propStr(p, "trustSealsTitle") ? <b className="wbx-col-title">{propStr(p, "trustSealsTitle")}</b> : null}
      <div className="wbx-seal-track" ref={track} role="list" aria-label={propStr(p, "trustSealsTitle", "نمادهای اعتماد")}>
        {ready ? safe.map((h, i) => <div key={i} role="listitem" className="wbx-seal" dangerouslySetInnerHTML={{ __html: h }} />) : codes.map((_, i) => <div key={i} className="wbx-seal" aria-hidden />)}
      </div>
    </div>
  )
}

/** Extras block placed inside any footer just above its copyright bar. */
export function FooterExtras({ p }: { p: P }) {
  return <><FooterExtraColumns p={p} /><TrustSealSlider p={p} /></>
}
