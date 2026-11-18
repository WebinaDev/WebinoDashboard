"use client"

import { useEffect, useState } from "react"

import "./site-status.css"

const fa = (n: number) => n.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false })

export function ComingSoonView({ name, launchAt }: { name: string; launchAt?: string | null }) {
  const target = launchAt ? new Date(launchAt).getTime() : NaN
  const [now, setNow] = useState<number | null>(null)
  const [contact, setContact] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const left = now != null && Number.isFinite(target) ? Math.max(0, target - now) : null
  const parts = left != null && left > 0
    ? [
        [Math.floor(left / 86400000), "روز"],
        [Math.floor(left / 3600000) % 24, "ساعت"],
        [Math.floor(left / 60000) % 60, "دقیقه"],
        [Math.floor(left / 1000) % 60, "ثانیه"],
      ] as const
    : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = contact.trim().replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    if (!v) return
    const body = v.includes("@") ? { email: v, source: "coming_soon" } : { phone: v, source: "coming_soon" }
    try {
      const res = await fetch("/api/v1/public/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      })
      setMsg(res.ok ? "ثبت شد! به محض راه‌اندازی خبرت می‌کنیم." : "ایمیل یا شماره موبایل معتبر نیست.")
      if (res.ok) setContact("")
    } catch {
      setMsg("ارسال نشد، دوباره تلاش کن.")
    }
  }

  return (
    <div className="ws ws-soon">
      <div className="grid" />
      <div className="blob" style={{ width: 520, height: 520, background: "#0054ff", top: -160, right: -120 }} />
      <div className="blob" style={{ width: 420, height: 420, background: "#7aa5ff", bottom: -160, left: -80 }} />
      <div className="wrap">
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark" src="/webina-mark.svg" alt="" />
          <div className="badge"><i className="dot" />در حال آماده‌سازی</div>
          <div className="site">{name}</div>
          <h1>یه چیز <span>خوب</span> در راهه!</h1>
          <p className="m">این سایت به‌زودی راه‌اندازی می‌شه. ایمیل یا موبایلت رو بذار تا اولین نفری باشی که خبردار می‌شه.</p>
          {parts && (
            <div className="cd" dir="rtl">
              {parts.map(([v, l]) => (
                <div key={l}><b>{fa(v)}</b><small>{l}</small></div>
              ))}
            </div>
          )}
          <form onSubmit={submit}>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="ایمیل یا شماره موبایل" aria-label="ایمیل یا شماره موبایل" />
            <button type="submit">خبرم کن</button>
          </form>
          {msg && <div className="msg">{msg}</div>}
          <div className="foot">ساخته‌شده با <b>وبینا</b></div>
        </div>
      </div>
    </div>
  )
}
