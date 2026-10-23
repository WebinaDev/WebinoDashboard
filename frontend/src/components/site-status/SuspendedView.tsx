import "./site-status.css"

const faDate = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long" }).format(d)
}

export function SuspendedView(props: { name: string; expiresAt?: string | null; renewUrl?: string | null; supportUrl?: string | null }) {
  const exp = faDate(props.expiresAt)
  const renew = props.renewUrl || "https://webina.dev"
  const support = props.supportUrl || "https://webina.dev/contact"
  return (
    <div className="ws ws-susp">
      <div className="blob" style={{ width: 420, height: 420, background: "#0054ff", top: -140, left: -100 }} />
      <div className="blob" style={{ width: 320, height: 320, background: "#bccdff", bottom: -80, right: -60, animationDelay: "-6s" }} />
      <div className="wrap">
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="ic"><img src="/webina-mark.svg" alt="" width={48} height={48} /></div>
          <div className="site">{props.name}</div>
          <h1>سایت موقتاً <span>در دسترس نیست</span></h1>
          <p className="m">این سایت برای مدتی کوتاه استراحت می‌کند.<br />لطفاً کمی بعد دوباره سر بزنید؛ به زودی برمی‌گردیم.</p>
          <div className="own">
            مدیر این سایت هستید؟ {exp ? <>اعتبار سرویس در <b>{exp}</b> به پایان رسیده است. </> : null}برای فعال‌سازی دوباره، اشتراک خود را تمدید کنید.
            <br />
            <a className="alt" href={renew}>تمدید سرویس</a>
            <a href={support}>تماس با پشتیبانی</a>
          </div>
        </div>
        <div className="foot">قدرت گرفته از <b>وبینا</b></div>
      </div>
    </div>
  )
}
