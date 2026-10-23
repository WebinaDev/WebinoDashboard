"use client"

import { useEffect, useRef, useState } from "react"

import {
  type LicenseRenewal,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  STATUS_LABEL,
  faDate,
  faNumber,
  faToman,
  isRestored,
  parseRenewal,
  readPaymentReturn,
  renewTarget,
  renewalPath,
  safeHttps,
  stripPaymentParams,
} from "@/lib/license-renewal"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

async function loadRenewal(returnUrl: string): Promise<LicenseRenewal | null> {
  const res = await fetch(`${API_BASE}${renewalPath(returnUrl)}`, { headers: { Accept: "application/json" }, cache: "no-store" })
  if (!res.ok) return null
  return parseRenewal(await res.json().catch(() => null))
}

async function siteActive(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/site-status`, { headers: { Accept: "application/json" }, cache: "no-store" })
    const j = (await res.json()) as { data?: { status?: string } }
    return j.data?.status !== "suspended"
  } catch {
    return false
  }
}

type Phase = "idle" | "checking" | "restored" | "pending" | "failed"

/** Suspended page: license info + ERP renewal periods/prices + «تمدید و پرداخت» (license-renewal API.md §1–2). */
export function RenewalPanel(props: { fallbackRenewUrl?: string | null; fallbackExpiresAt?: string | null; supportUrl: string }) {
  const [r, setR] = useState<LicenseRenewal | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const returnUrl = `${window.location.origin}/`
    const ret = readPaymentReturn(window.location.search)
    let cancelled = false

    void loadRenewal(returnUrl).then((d) => {
      if (cancelled) return
      setR(d)
      setLoaded(true)
    })

    if (ret) {
      if (ret.status !== "settled") {
        setPhase("failed")
      } else {
        setPhase("checking")
        const deadline = Date.now() + POLL_TIMEOUT_MS
        const tick = async () => {
          if (cancelled) return
          const d = await loadRenewal(returnUrl).catch(() => null)
          if (d) setR(d)
          if (isRestored(d) && (await siteActive())) {
            setPhase("restored")
            window.location.replace(stripPaymentParams(window.location.href))
            return
          }
          if (Date.now() >= deadline) {
            setPhase(isRestored(d) ? "restored" : "pending")
            if (isRestored(d)) window.location.replace(stripPaymentParams(window.location.href))
            return
          }
          setTimeout(tick, POLL_INTERVAL_MS)
        }
        void tick()
      }
    }
    return () => {
      cancelled = true
    }
  }, [])

  const href = safeHttps(renewTarget(r, props.fallbackRenewUrl))
  const exp = faDate(r?.expires_at ?? props.fallbackExpiresAt)

  return (
    <div className="own lr">
      {phase === "checking" ? <div className="lr-note">پرداخت انجام شد؛ در حال بررسی وضعیت لایسنس و فعال‌سازی دوبارهٔ سایت…</div> : null}
      {phase === "restored" ? <div className="lr-note ok">لایسنس تمدید شد؛ سایت در حال بارگذاری دوباره است…</div> : null}
      {phase === "pending" ? (
        <div className="lr-note">پرداخت ثبت شد ولی فعال‌سازی سایت هنوز کامل نشده است. چند لحظه دیگر صفحه را دوباره باز کنید.</div>
      ) : null}
      {phase === "failed" ? <div className="lr-note err">پرداخت ناموفق بود یا لغو شد. می‌توانید دوباره تلاش کنید.</div> : null}

      <div>مدیر این سایت هستید؟</div>
      {r ? (
        <dl className="lr-info">
          <div>
            <dt>وضعیت لایسنس</dt>
            <dd>{STATUS_LABEL[r.status] ?? r.status}</dd>
          </div>
          {exp ? (
            <div>
              <dt>تاریخ انقضا</dt>
              <dd>{exp}</dd>
            </div>
          ) : null}
          {r.plan ? (
            <div>
              <dt>پلن</dt>
              <dd>{r.plan.name}</dd>
            </div>
          ) : null}
        </dl>
      ) : exp ? (
        <p>اعتبار سرویس در <b>{exp}</b> به پایان رسیده است.</p>
      ) : null}

      {r && r.renewable && r.options.length > 0 ? (
        <ul className="lr-opts" aria-label="دوره‌های تمدید">
          {r.options.map((o) => (
            <li key={o.id}>
              <b>{o.label}</b>
              <span className="lr-price">
                {o.discount_percent ? <s>{faToman(Math.round(o.price_irr / 10))}</s> : null}
                {faToman(o.final_toman)}
                {o.discount_percent ? <em>{faNumber(o.discount_percent)}٪ تخفیف</em> : null}
              </span>
              {faDate(o.new_expires_at) ? <small>اعتبار تا {faDate(o.new_expires_at)}</small> : null}
            </li>
          ))}
        </ul>
      ) : loaded && r && !r.renewable ? (
        <p>تمدید آنلاین برای این لایسنس فعال نیست؛ لطفاً با پشتیبانی تماس بگیرید.</p>
      ) : null}

      <div className="lr-actions">
        {href && (!r || r.renewable) ? (
          <a className="alt" href={href}>
            تمدید و پرداخت
          </a>
        ) : null}
        <a href={props.supportUrl}>تماس با پشتیبانی</a>
      </div>
    </div>
  )
}
