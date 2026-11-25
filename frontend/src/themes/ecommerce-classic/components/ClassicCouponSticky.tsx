"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { fetchAvailableCoupons, type AvailableCoupon } from "@/builder/storefront/coupon"
import { IconChevronLeft, IconChevronRight, IconClose } from "./icons"
import { ClassicAmount } from "./parts"

const COLLAPSE_KEY = "wb_coupon_sticky_collapsed"

function readCartSubtotal(): number {
  if (typeof window === "undefined") return 0
  try {
    const raw = window.localStorage.getItem("wb_cart") || window.localStorage.getItem("cart")
    if (!raw) return 0
    const parsed = JSON.parse(raw) as Array<{ price?: number; qty?: number; quantity?: number }> | { items?: Array<{ price?: number; qty?: number; quantity?: number }> }
    const items = Array.isArray(parsed) ? parsed : (parsed.items ?? [])
    return items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.qty ?? it.quantity) || 1), 0)
  } catch {
    return 0
  }
}

export function ClassicCouponSticky() {
  const [subtotal, setSubtotal] = useState(0)
  const [coupons, setCoupons] = useState<AvailableCoupon[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [offsetY, setOffsetY] = useState(0)
  const dragRef = useRef<{ startY: number; startOffset: number; moved: boolean } | null>(null)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1")
    } catch {
      /* ignore */
    }
    const sync = () => setSubtotal(readCartSubtotal())
    sync()
    window.addEventListener("storage", sync)
    window.addEventListener("wb:cart-updated", sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener("wb:cart-updated", sync)
    }
  }, [])

  useEffect(() => {
    let alive = true
    void fetchAvailableCoupons(subtotal).then((rows) => {
      if (alive) setCoupons(rows)
    })
    return () => {
      alive = false
    }
  }, [subtotal])

  const nextCoupon = useMemo(() => {
    const upcoming = coupons
      .filter((c) => !c.eligible && c.min_spend_minor && c.min_spend_minor > subtotal)
      .sort((a, b) => (a.min_spend_minor ?? 0) - (b.min_spend_minor ?? 0))
    return upcoming[0] ?? null
  }, [coupons, subtotal])

  const eligibleCoupon = useMemo(() => coupons.find((c) => c.eligible) ?? null, [coupons])

  if (!nextCoupon && !eligibleCoupon) return null

  const remain = nextCoupon ? Math.max(0, (nextCoupon.min_spend_minor ?? 0) - subtotal) : 0
  const pct = nextCoupon && nextCoupon.min_spend_minor ? Math.min(100, Math.round((subtotal / nextCoupon.min_spend_minor) * 100)) : 100

  function toggleCollapsed(next: boolean) {
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`sfc-coupon-sticky${collapsed ? " is-collapsed" : ""}`}
      style={{ transform: `translateY(${offsetY}px)` }}
      dir="rtl"
    >
      {collapsed ? (
        <button
          type="button"
          className="sfc-coupon-sticky__tab"
          onClick={() => toggleCollapsed(false)}
          aria-label="نمایش وضعیت کوپن تخفیف"
          title="نمایش کوپن تخفیف"
        >
          <IconChevronRight size={18} />
        </button>
      ) : (
        <div
          className="sfc-coupon-sticky__card"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return
            dragRef.current = { startY: e.clientY, startOffset: offsetY, moved: false }
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return
            const dy = e.clientY - dragRef.current.startY
            if (Math.abs(dy) > 4) dragRef.current.moved = true
            setOffsetY(Math.max(-240, Math.min(40, dragRef.current.startOffset + dy)))
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
        >
          <div className="sfc-coupon-sticky__head">
            <span className="sfc-coupon-sticky__title">
              {nextCoupon ? "تا کوپن بعدی" : "کوپن فعال برای شما"}
            </span>
            <button
              type="button"
              className="sfc-coupon-sticky__close"
              onClick={() => toggleCollapsed(true)}
              aria-label="بستن و انتقال به کنار صفحه"
            >
              <IconChevronLeft size={16} />
              <IconClose size={14} />
            </button>
          </div>
          {nextCoupon ? (
            <>
              <p className="sfc-coupon-sticky__desc">
                <ClassicAmount value={remain} /> مانده تا کوپن <b>{nextCoupon.code}</b>
              </p>
              <div className="sfc-coupon-sticky__bar" aria-hidden="true">
                <div className="sfc-coupon-sticky__fill" style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : eligibleCoupon ? (
            <p className="sfc-coupon-sticky__desc">
              کد <b>{eligibleCoupon.code}</b> قابل استفاده است.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
