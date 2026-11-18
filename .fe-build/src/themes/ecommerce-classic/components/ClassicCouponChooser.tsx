"use client"

import { useEffect, useRef, useState } from "react"

import { fetchAvailableCoupons, type AvailableCoupon } from "@/builder/storefront/coupon"

import { IconChevronLeft, IconChevronRight } from "./icons"
import { ClassicAmount, useDigits } from "./parts"

/** "کوپن‌هایی که می‌توانید استفاده کنید" — horizontal card rail (parisma webino-coupon-chooser parity). */
export function ClassicCouponChooser({
  subtotal,
  appliedCode,
  busy,
  onApply,
  onRemove,
}: {
  subtotal: number
  appliedCode: string | null
  busy?: boolean
  onApply: (code: string) => void
  onRemove: () => void
}) {
  const digits = useDigits()
  const [items, setItems] = useState<AvailableCoupon[]>([])
  const rail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const t = window.setTimeout(() => {
      void fetchAvailableCoupons(subtotal).then((rows) => alive && setItems(rows))
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [subtotal])

  if (!items.length) return null
  const scroll = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * 280, behavior: "smooth" })

  return (
    <section className="sfc-cc" aria-label="کوپن‌های قابل استفاده">
      <div className="sfc-cc__head">
        <div>
          <strong className="sfc-cc__title">
            کوپن‌هایی که می‌توانید استفاده کنید <span className="sfc-cc__count">{digits(items.length)}</span>
          </strong>
          <p className="sfc-cc__hint">در هر سفارش فقط یک کوپن اعمال می‌شود؛ هر کدام را می‌خواهید انتخاب کنید.</p>
        </div>
        <div className="sfc-cc__nav">
          <button type="button" aria-label="قبلی" onClick={() => scroll(1)}>
            <IconChevronRight size={14} />
          </button>
          <button type="button" aria-label="بعدی" onClick={() => scroll(-1)}>
            <IconChevronLeft size={14} />
          </button>
        </div>
      </div>
      <div className="sfc-cc__list" ref={rail}>
        {items.map((c) => {
          const isApplied = appliedCode?.toUpperCase() === c.code.toUpperCase()
          return (
            <article key={c.code} className={`sfc-cc__card${isApplied ? " is-applied" : ""}${c.eligible ? "" : " is-disabled"}`}>
              <div className="sfc-cc__main">
                <div className="sfc-cc__badges">
                  {isApplied ? <span className="sfc-cc__badge sfc-cc__badge--applied">اعمال شده</span> : null}
                  {c.free_shipping ? <span className="sfc-cc__badge">ارسال رایگان</span> : null}
                  <code className="sfc-cc__code">{c.code}</code>
                </div>
                <div className="sfc-cc__benefit">
                  {c.type === "percent" ? `${digits(c.amount)}٪ تخفیف` : c.description || "تخفیف ویژه"}
                </div>
                {c.min_spend_minor ? (
                  <div className="sfc-cc__detail">
                    برای خرید از <ClassicAmount value={c.min_spend_minor} />
                  </div>
                ) : null}
                {!c.eligible && c.reason ? <div className="sfc-cc__reason">{c.reason}</div> : null}
              </div>
              <div className="sfc-cc__side">
                {c.eligible && c.discount_minor > 0 ? (
                  <div className="sfc-cc__save">
                    <span>سود شما</span>
                    <ClassicAmount value={c.discount_minor} />
                  </div>
                ) : null}
                {isApplied ? (
                  <button type="button" className="sfc-cc__btn sfc-cc__btn--remove" disabled={busy} onClick={onRemove}>
                    حذف
                  </button>
                ) : (
                  <button type="button" className="sfc-cc__btn" disabled={busy || !c.eligible} onClick={() => onApply(c.code)}>
                    اعمال
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
