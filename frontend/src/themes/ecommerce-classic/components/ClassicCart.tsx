"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"

import { cartSnapshot, clearCart, setQty, subscribeCart } from "@/builder/cart"
import { setServerQty, useServerCart } from "@/builder/storefront/actions"

import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

import { IconArrowRight, IconBag, IconCard, IconCheck, IconChevronLeft, IconMinus, IconPin, IconPlus, IconTruck, IconUser } from "./icons"
import { ClassicAmount, useDigits } from "./parts"

const STEPS: { label: string; icon: ReactNode }[] = [
  { label: "سبد خرید", icon: <IconBag size={18} /> },
  { label: "اطلاعات", icon: <IconPin size={18} /> },
  { label: "پرداخت", icon: <IconCard size={18} /> },
  { label: "تکمیل", icon: <IconCheck size={18} /> },
]

export function ClassicCheckoutSteps({ active = 0 }: { active?: number }) {
  return (
    <div className="sfc-steps-bar">
      <Link href="/shop" className="sfc-steps-bar__back">
        <IconArrowRight size={22} />
        <strong>بازگشت به فروشگاه</strong>
        <span>شما داخل سبد خرید هستید</span>
      </Link>
      <ol className="sfc-steps">
        {STEPS.map((step, index) => (
          <li key={step.label} className={index === active ? "is-active" : index < active ? "is-done" : ""}>
            <span className="sfc-steps__icon">{step.icon}</span>
            <span className="sfc-steps__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SadIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="sfc-sad">
      <defs>
        <linearGradient id="sfc-sad-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ff5a6e" />
          <stop offset="1" stopColor="#e80645" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#sfc-sad-g)" />
      <circle cx="24" cy="27" r="3.4" fill="#fff" />
      <circle cx="40" cy="27" r="3.4" fill="#fff" />
      <path d="M22 44c5.5-6 14.5-6 20 0" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Countdown() {
  const digits = useDigits()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const end = useMemo(() => {
    const d = new Date()
    d.setHours(23, 59, 59, 0)
    return d.getTime()
  }, [])
  const diff = now == null ? 0 : Math.max(0, end - now)
  const parts = [Math.floor(diff / 3600000), Math.floor((diff % 3600000) / 60000), Math.floor((diff % 60000) / 1000)]
  return (
    <div className="sfc-countdown" dir="ltr">
      {parts.map((value, index) => (
        <span key={index} className="sfc-countdown__group">
          {index > 0 ? <i>:</i> : null}
          {String(value)
            .padStart(2, "0")
            .split("")
            .map((ch, i) => (
              <b key={i} className={index === 2 ? "is-hot" : ""}>
                {digits(Number(ch))}
              </b>
            ))}
        </span>
      ))}
    </div>
  )
}

type Line = { key: string; name: string; image?: string | null; price: number; qty: number; href?: string; onQty: (qty: number) => void }


function FreeShippingBar({ total, threshold }: { total: number; threshold: number }) {
  const pct = Math.min(100, Math.round((total / Math.max(threshold, 1)) * 100))
  const remain = Math.max(0, threshold - total)
  return (
    <div className="sfc-free-ship">
      <div className="sfc-free-ship__copy">
        <IconTruck size={18} />
        <div>
          <strong>ارسال رایگان برای سفارشات</strong>
          <p>
            {remain <= 0 ? (
              <>تبریک! ارسال این سفارش رایگان است.</>
            ) : (
              <>
                با حداقل خرید <ClassicAmount value={threshold} /> — هنوز <ClassicAmount value={remain} /> مانده است
              </>
            )}
          </p>
        </div>
      </div>
      <div className="sfc-free-ship__bar" aria-hidden="true">
        <div className="sfc-free-ship__thumb" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ClassicCart() {
  const digits = useDigits()
  const theme = useClassicThemeSettings()
  const commerce = theme.commerce ?? {}
  const showCoupon = commerce.cart_coupon !== false
  const showFreeShip = Boolean(commerce.free_shipping_bar_enabled)
  const freeShipThreshold = Math.max(0, Number(commerce.free_shipping_threshold ?? 500000))
  const showCountdown = commerce.cart_deals_countdown !== false
  const stickySummary = commerce.cart_sticky_summary !== false
  const [coupon, setCoupon] = useState("")
  const [couponNote, setCouponNote] = useState("")
  const local = useSyncExternalStore(subscribeCart, cartSnapshot, () => [])
  const { cart, auth } = useServerCart()
  const pricing = cart?.pricing

  const lines: Line[] =
    auth === "auth"
      ? (cart?.items ?? []).map((line) => ({
          key: String(line.id),
          name: line.product.name,
          image: line.product.cover_image_url || line.product.image_url,
          price: pricing?.lines?.find((row) => row.id === line.id)?.unit_price_minor ?? line.product.price_minor,
          qty: line.quantity,
          href: line.product.slug ? `/product/${line.product.slug}` : undefined,
          onQty: (qty: number) => void setServerQty(line.product.id, qty),
        }))
      : local.map((line) => ({
          key: line.slug,
          name: line.name,
          image: line.image,
          price: line.price,
          qty: line.qty,
          href: `/product/${line.slug}`,
          onQty: (qty: number) => setQty(line.slug, qty),
        }))
  const count = lines.reduce((sum, l) => sum + l.qty, 0)
  const total = auth === "auth" && pricing?.subtotal_minor != null ? pricing.subtotal_minor : lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  return (
    <div className="sfc-cart sfc-container">
      {!lines.length && auth !== "loading" ? <p className="sfc-cart__flash">سبد خرید شما در حال حاضر خالی است.</p> : null}
      <ClassicCheckoutSteps active={0} />
      {showFreeShip && freeShipThreshold > 0 ? (
        <FreeShippingBar total={total} threshold={freeShipThreshold} />
      ) : null}
      <div className="sfc-cart__headline">
        <h1>
          سبد خرید <span className="sfc-pill">{digits(count)}</span>
        </h1>
        <span className="sfc-cart__later">سبد خرید بعدی ({digits(0)})</span>
      </div>
      <div className="sfc-cart__grid">
        <div className="sfc-cart__main">
          {auth === "loading" ? (
            <div className="sfc-box sfc-cart__empty">
              <span className="sfc-empty-note">در حال بارگذاری…</span>
            </div>
          ) : !lines.length ? (
            <div className="sfc-box sfc-cart__empty">
              <SadIcon />
              <h2>سبد خرید شما خالیست</h2>
              <p>می‌توانید برای مشاهده محصولات بیشتر به صفحات زیر بروید</p>
              <div className="sfc-cart__links">
                <Link href="/shop">
                  مشاهده همه محصولات <IconChevronLeft size={12} />
                </Link>
                <Link href="/amazing-offers">
                  محصولات شگفت‌انگیز <IconChevronLeft size={12} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="sfc-box sfc-cart__lines">
              {auth !== "auth" ? <p className="sfc-cart__guest">برای ثبت نهایی سفارش وارد حساب کاربری شوید؛ سبد شما حفظ می‌شود.</p> : null}
              {lines.map((line) => (
                <div key={line.key} className="sfc-cart-line">
                  <span className="sfc-cart-line__img">{line.image ? <img src={line.image} alt="" /> : null}</span>
                  <div className="sfc-cart-line__body">
                    {line.href ? (
                      <Link href={line.href} className="sfc-cart-line__name">
                        {line.name}
                      </Link>
                    ) : (
                      <span className="sfc-cart-line__name">{line.name}</span>
                    )}
                    <ClassicAmount value={line.price} className="sfc-cart-line__price" />
                  </div>
                  <div className="sfc-stepper sfc-stepper--sm">
                    <button type="button" aria-label="افزایش" onClick={() => line.onQty(Math.min(99, line.qty + 1))}>
                      <IconPlus size={14} />
                    </button>
                    <span className="sfc-stepper__value">{digits(line.qty)}</span>
                    <button type="button" aria-label="کاهش" onClick={() => line.onQty(Math.max(0, line.qty - 1))}>
                      <IconMinus size={14} />
                    </button>
                  </div>
                  <ClassicAmount value={line.price * line.qty} className="sfc-cart-line__total" />
                </div>
              ))}
              {auth !== "auth" ? (
                <button type="button" className="sfc-link-btn" onClick={() => clearCart()}>
                  خالی کردن سبد
                </button>
              ) : null}
              {showCoupon ? (
                <form
                  className="sfc-coupon"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setCouponNote(
                      coupon.trim()
                        ? "کد در مرحله تسویه اعمال می‌شود."
                        : "کد تخفیف را وارد کنید.",
                    )
                  }}
                >
                  <input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    placeholder="کد تخفیف را وارد نمایید"
                    aria-label="کد تخفیف"
                  />
                  <button type="submit" className="sfc-btn sfc-btn--sm">
                    اعمال کد تخفیف
                  </button>
                  {couponNote ? <span className="sfc-coupon__note">{couponNote}</span> : null}
                </form>
              ) : null}
            </div>
          )}
        </div>
        <aside className={`sfc-cart__side ${stickySummary ? "is-sticky" : ""}`}>
          {lines.length ? (
            <div className="sfc-box sfc-summary">
              <div className="sfc-summary__row">
                <span>قیمت کالاها ({digits(count)})</span>
                <ClassicAmount value={total} />
              </div>
              {pricing?.purchase_type === "installment" && pricing.installment_monthly_minor ? (
                <div className="sfc-summary__row">
                  <span>{digits(pricing.installment_months ?? 0)} قسط ماهانه</span>
                  <ClassicAmount value={pricing.installment_monthly_minor} />
                </div>
              ) : null}
              <div className="sfc-summary__row sfc-summary__row--total">
                <span>جمع سبد خرید</span>
                <ClassicAmount value={total} />
              </div>
              <Link
                href={auth === "auth" ? "/checkout" : `/login?next=${encodeURIComponent("/checkout")}`}
                className="sfc-btn sfc-btn--block sfc-btn--lg"
              >
                {auth === "auth" ? "ادامه فرایند خرید" : "ورود و ادامه خرید"}
              </Link>
            </div>
          ) : null}
          {auth !== "auth" ? (
            <Link href={`/login?next=${encodeURIComponent("/cart")}`} className="sfc-box sfc-side-card">
              <span className="sfc-side-card__head">
                <span className="sfc-side-card__icon">
                  <IconUser size={16} />
                </span>
                <strong>ورود به حساب کاربری</strong>
                <IconChevronLeft size={16} className="sfc-side-card__chev" />
              </span>
              <span className="sfc-side-card__text">جهت مشاهده محصولاتی که پیش‌تر به سبد خرید خود اضافه کرده‌اید وارد شوید.</span>
            </Link>
          ) : null}
          {showCountdown ? (
            <div className="sfc-box sfc-side-card">
              <span className="sfc-side-card__head">
                <strong>پیشنهاد شگفت‌انگیز</strong>
                <Link href="/amazing-offers" className="sfc-side-card__more">
                  مشاهده محصولات <IconChevronLeft size={12} />
                </Link>
              </span>
              <Countdown />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
