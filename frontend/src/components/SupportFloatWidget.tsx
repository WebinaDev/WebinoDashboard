"use client"

import { usePathname } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import { quietApi } from "@/builder/storefront/session"

type Channel = { enabled?: boolean; url?: string; number?: string; address?: string }

type WidgetConfig = {
  enabled?: boolean
  online?: boolean
  position?: "bottom-right" | "bottom-left"
  primary_color?: string
  launcher_label_fa?: string
  launcher_label_en?: string
  greeting_fa?: string
  greeting_en?: string
  avatar_url?: string | null
  show_agent_name?: boolean
  agent_name_fa?: string
  agent_name_en?: string
  offline?: { message_fa?: string; message_en?: string; form_enabled?: boolean }
  channels?: Record<string, Channel>
  pages?: { show_on_all?: boolean; hide_paths?: string[] }
}

type Dept = {
  id: number
  name_fa: string
  name_en?: string | null
  form_fields?: Array<{ key: string; type: string; label_fa?: string; label_en?: string; required?: boolean; options?: string[] }>
}

type KbItem = { id: number; slug: string; title_fa: string; title_en?: string | null; excerpt_fa?: string | null; excerpt_en?: string | null }

type ChatMsg = { id: number; sender_type: string; body: string }

function isFa(): boolean {
  if (typeof document === "undefined") return true
  return (document.documentElement.lang || "fa").toLowerCase().startsWith("fa")
}

function visitorTokenKey(): string {
  return "webina_support_chat_token"
}

/** Storefront floating online-support widget (live chat + ticket form + KB + channels). */
export function SupportFloatWidget() {
  const pathname = usePathname() || "/"
  const [cfg, setCfg] = useState<WidgetConfig | null>(null)
  const [deps, setDeps] = useState<Dept[]>([])
  const [kb, setKb] = useState<KbItem[]>([])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"home" | "chat" | "ticket" | "kb">("home")
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    body: "",
    department_id: "",
  })
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [chatBody, setChatBody] = useState("")
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatStatus, setChatStatus] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const afterId = useRef(0)
  const fa = isFa()

  useEffect(() => {
    void quietApi<{ data?: WidgetConfig }>("/api/v1/public/support/widget").then((res) => {
      if (res.ok) setCfg(res.data.data ?? null)
    })
    try {
      const saved = localStorage.getItem(visitorTokenKey())
      if (saved) setToken(saved)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!cfg?.enabled) return
    void quietApi<{ data?: { items?: Dept[] } }>("/api/v1/public/support/departments").then((res) => {
      if (res.ok) setDeps(res.data.data?.items ?? [])
    })
    void quietApi<{ data?: { items?: KbItem[] } }>("/api/v1/public/support/kb?widget=1").then((res) => {
      if (res.ok) setKb(res.data.data?.items ?? [])
    })
  }, [cfg?.enabled])

  useEffect(() => {
    if (!open || mode !== "chat" || !token) return
    const tick = () => {
      void quietApi<{
        data?: { messages?: ChatMsg[]; session?: { status?: string } }
      }>(`/api/v1/public/support/chat/poll?visitor_token=${encodeURIComponent(token)}&after_id=${afterId.current}`).then(
        (res) => {
          if (!res.ok) return
          const msgs = res.data.data?.messages ?? []
          if (msgs.length) {
            setChatMsgs((prev) => {
              const ids = new Set(prev.map((m) => m.id))
              const next = [...prev]
              for (const m of msgs) {
                if (!ids.has(m.id)) next.push(m)
              }
              return next
            })
            afterId.current = Math.max(afterId.current, ...msgs.map((m) => m.id))
          }
          if (res.data.data?.session?.status) setChatStatus(res.data.data.session.status)
        },
      )
    }
    tick()
    const id = window.setInterval(tick, 2000)
    return () => window.clearInterval(id)
  }, [open, mode, token])

  const hidden = useMemo(() => {
    const hides = cfg?.pages?.hide_paths ?? []
    return hides.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || pathname.startsWith(p))
  }, [cfg, pathname])

  if (!cfg?.enabled || hidden) return null

  const color = cfg.primary_color || "#0f766e"
  const side = cfg.position === "bottom-left" ? "left-4" : "right-4"
  const label = fa ? cfg.launcher_label_fa || "پشتیبانی" : cfg.launcher_label_en || "Support"
  const greeting = fa ? cfg.greeting_fa : cfg.greeting_en
  const agent = fa ? cfg.agent_name_fa : cfg.agent_name_en
  const offlineMsg = fa ? cfg.offline?.message_fa : cfg.offline?.message_en
  const online = Boolean(cfg.online)
  const channels = cfg.channels ?? {}
  const selectedDept = deps.find((d) => String(d.id) === form.department_id)
  const showTicket = Boolean(channels.ticket?.enabled) && (online || Boolean(cfg.offline?.form_enabled))
  const showLive = Boolean(channels.live_chat?.enabled) && online

  async function submitTicket() {
    setSending(true)
    setError(null)
    setDone(null)
    const res = await quietApi<{ data?: { ticket_number?: string }; message?: string }>("/api/v1/public/support/messages", {
      method: "POST",
      json: {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        subject: form.subject,
        body: form.body,
        department_id: form.department_id ? Number(form.department_id) : undefined,
        form_values: fieldValues,
      },
    })
    setSending(false)
    if (!res.ok) {
      setError(fa ? "ارسال ناموفق بود. دوباره تلاش کنید." : "Could not send. Please try again.")
      return
    }
    setDone(res.data?.data?.ticket_number || (fa ? "ثبت شد" : "Submitted"))
    setForm({ name: "", email: "", phone: "", subject: "", body: "", department_id: "" })
    setFieldValues({})
  }

  async function startOrSendChat() {
    setSending(true)
    setError(null)
    const text = chatBody.trim()
    if (!text) {
      setSending(false)
      return
    }
    if (!token) {
      const res = await quietApi<{
        data?: {
          visitor_token?: string
          session?: { status?: string; messages?: ChatMsg[] }
          message?: ChatMsg
        }
      }>("/api/v1/public/support/chat/start", {
        method: "POST",
        json: {
          name: form.name || undefined,
          email: form.email || undefined,
          department_id: form.department_id ? Number(form.department_id) : undefined,
          body: text,
        },
      })
      setSending(false)
      if (!res.ok) {
        setError(fa ? "شروع گفتگو ناموفق بود." : "Could not start chat.")
        return
      }
      const vt = res.data.data?.visitor_token
      if (vt) {
        setToken(vt)
        try {
          localStorage.setItem(visitorTokenKey(), vt)
        } catch {
          /* ignore */
        }
      }
      const msgs = res.data.data?.session?.messages ?? []
      if (res.data.data?.message) msgs.push(res.data.data.message)
      setChatMsgs(msgs)
      afterId.current = Math.max(0, ...msgs.map((m) => m.id))
      setChatStatus(res.data.data?.session?.status ?? "waiting")
      setChatBody("")
      return
    }
    const res = await quietApi<{ data?: ChatMsg }>("/api/v1/public/support/chat/messages", {
      method: "POST",
      json: { visitor_token: token, body: text },
    })
    setSending(false)
    if (!res.ok) {
      setError(fa ? "ارسال ناموفق بود." : "Could not send.")
      return
    }
    const msg = res.data.data
    if (msg) {
      setChatMsgs((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      afterId.current = Math.max(afterId.current, msg.id)
    }
    setChatBody("")
  }

  return (
    <div className={`fixed bottom-4 ${side} z-40 flex flex-col items-end gap-2 print:hidden`} style={{ bottom: "5.5rem" }}>
      {open ? (
        <div className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-white text-sm shadow-xl" dir={fa ? "rtl" : "ltr"}>
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: color }}>
            {cfg.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cfg.avatar_url} alt="" className="size-10 rounded-full object-cover" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-full bg-white/20 text-lg">💬</div>
            )}
            <div className="min-w-0 flex-1">
              {cfg.show_agent_name !== false && agent ? <p className="truncate font-semibold">{agent}</p> : null}
              <p className="text-xs opacity-90">{online ? (fa ? "آنلاین" : "Online") : fa ? "آفلاین" : "Offline"}</p>
            </div>
            {mode !== "home" ? (
              <button type="button" className="rounded-full bg-white/15 px-2 py-1 text-xs" onClick={() => setMode("home")}>
                ←
              </button>
            ) : null}
            <button type="button" className="rounded-full bg-white/15 px-2 py-1 text-xs" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
            {mode === "home" ? (
              <>
                {greeting ? <p className="text-slate-700">{greeting}</p> : null}
                {!online && offlineMsg ? <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{offlineMsg}</p> : null}
                <div className="grid gap-2">
                  {showLive ? (
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-center font-medium text-white"
                      style={{ background: color }}
                      onClick={() => setMode("chat")}
                    >
                      {fa ? "گفتگوی زنده" : "Live chat"}
                    </button>
                  ) : null}
                  {showTicket ? (
                    <button type="button" className="rounded-lg border px-3 py-2 text-center font-medium" onClick={() => setMode("ticket")}>
                      {fa ? "ارسال تیکت" : "Send a ticket"}
                    </button>
                  ) : null}
                  {kb.length ? (
                    <button type="button" className="rounded-lg border px-3 py-2 text-center font-medium" onClick={() => setMode("kb")}>
                      {fa ? "راهنما و مقالات" : "Help articles"}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  {channels.telegram?.enabled && channels.telegram.url ? (
                    <a href={channels.telegram.url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#229ED9] px-3 py-2 text-center font-medium text-white">
                      Telegram
                    </a>
                  ) : null}
                  {channels.bale?.enabled && channels.bale.url ? (
                    <a href={channels.bale.url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#00a99d] px-3 py-2 text-center font-medium text-white">
                      {fa ? "بله" : "Bale"}
                    </a>
                  ) : null}
                  {channels.whatsapp?.enabled && channels.whatsapp.url ? (
                    <a href={channels.whatsapp.url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#25D366] px-3 py-2 text-center font-medium text-white">
                      WhatsApp
                    </a>
                  ) : null}
                  {channels.phone?.enabled && channels.phone.number ? (
                    <a href={`tel:${channels.phone.number}`} className="rounded-lg border px-3 py-2 text-center font-medium">
                      {channels.phone.number}
                    </a>
                  ) : null}
                  {channels.email?.enabled && channels.email.address ? (
                    <a href={`mailto:${channels.email.address}`} className="rounded-lg border px-3 py-2 text-center font-medium">
                      {channels.email.address}
                    </a>
                  ) : null}
                </div>
              </>
            ) : null}

            {mode === "kb" ? (
              <div className="space-y-2">
                {kb.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3">
                    <p className="font-medium">{fa ? a.title_fa : a.title_en || a.title_fa}</p>
                    {(fa ? a.excerpt_fa : a.excerpt_en || a.excerpt_fa) ? (
                      <p className="mt-1 text-xs text-slate-600">{fa ? a.excerpt_fa : a.excerpt_en || a.excerpt_fa}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {mode === "chat" ? (
              <div className="space-y-2">
                {!token ? (
                  <>
                    <input
                      className="h-9 w-full rounded-md border px-2"
                      placeholder={fa ? "نام (اختیاری)" : "Name (optional)"}
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                    {deps.length ? (
                      <select
                        className="h-9 w-full rounded-md border px-2"
                        value={form.department_id}
                        onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                      >
                        <option value="">{fa ? "دپارتمان" : "Department"}</option>
                        {deps.map((d) => (
                          <option key={d.id} value={String(d.id)}>
                            {fa ? d.name_fa : d.name_en || d.name_fa}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </>
                ) : null}
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border bg-slate-50 p-2">
                  {chatMsgs.length === 0 ? (
                    <p className="text-xs text-slate-500">{fa ? "پیام خود را بنویسید تا گفتگو شروع شود." : "Write a message to start."}</p>
                  ) : (
                    chatMsgs.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[90%] rounded-lg px-2 py-1 text-xs ${
                          m.sender_type === "visitor"
                            ? "ms-auto bg-teal-700 text-white"
                            : m.sender_type === "system"
                              ? "mx-auto bg-slate-200 text-slate-600"
                              : "bg-white border"
                        }`}
                      >
                        {m.body}
                      </div>
                    ))
                  )}
                </div>
                {chatStatus === "closed" ? (
                  <p className="text-xs text-slate-500">{fa ? "گفتگو بسته شد." : "Chat closed."}</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="h-9 flex-1 rounded-md border px-2"
                      value={chatBody}
                      onChange={(e) => setChatBody(e.target.value)}
                      placeholder={fa ? "پیام…" : "Message…"}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          void startOrSendChat()
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={sending || !chatBody.trim()}
                      onClick={() => void startOrSendChat()}
                      className="rounded-lg px-3 py-2 font-medium text-white disabled:opacity-50"
                      style={{ background: color }}
                    >
                      {fa ? "ارسال" : "Send"}
                    </button>
                  </div>
                )}
                {error ? <p className="text-xs text-red-600">{error}</p> : null}
              </div>
            ) : null}

            {mode === "ticket" && showTicket ? (
              <div className="space-y-2">
                <p className="font-medium">{fa ? "ارسال پیام" : "Send a message"}</p>
                {deps.length ? (
                  <select
                    className="h-9 w-full rounded-md border px-2"
                    value={form.department_id}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                  >
                    <option value="">{fa ? "دپارتمان (اختیاری)" : "Department (optional)"}</option>
                    {deps.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {fa ? d.name_fa : d.name_en || d.name_fa}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  className="h-9 w-full rounded-md border px-2"
                  placeholder={fa ? "نام" : "Name"}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="h-9 w-full rounded-md border px-2"
                  placeholder={fa ? "ایمیل" : "Email"}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
                <input
                  className="h-9 w-full rounded-md border px-2"
                  placeholder={fa ? "موضوع" : "Subject"}
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
                {(selectedDept?.form_fields ?? []).map((field) => (
                  <input
                    key={field.key}
                    className="h-9 w-full rounded-md border px-2"
                    placeholder={fa ? field.label_fa || field.key : field.label_en || field.label_fa || field.key}
                    required={field.required}
                    value={fieldValues[field.key] ?? ""}
                    onChange={(e) => setFieldValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                ))}
                <textarea
                  className="min-h-20 w-full rounded-md border px-2 py-1"
                  placeholder={fa ? "پیام شما" : "Your message"}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                />
                {error ? <p className="text-xs text-red-600">{error}</p> : null}
                {done ? (
                  <p className="text-xs text-emerald-700">
                    {fa ? "ثبت شد" : "Submitted"}
                    {done.startsWith("TKT") || done.includes("-") ? ` · ${done}` : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={sending || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
                  onClick={() => void submitTicket()}
                  className="w-full rounded-lg px-3 py-2 font-medium text-white disabled:opacity-50"
                  style={{ background: color }}
                >
                  {sending ? (fa ? "در حال ارسال…" : "Sending…") : fa ? "ارسال" : "Send"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-white shadow-lg"
        style={{ background: color }}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.6 1.3 4.9 3.4 6.5L4.6 22l4.2-2.1c1 .3 2.1.4 3.2.4 5.5 0 10-3.9 10-8.6S17.5 3 12 3z" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
      </button>
    </div>
  )
}
