import { cn } from "@/lib/utils"

/** Developer credit, copied 1:1 from the parisma.ir footer (`.footer-content__company-names-logo`). */
export const WEBINA_CREDIT_HREF = "https://webina.dev"
export const WEBINA_CREDIT_TITLE = "طراحی و توسعه توسط"
export const WEBINA_CREDIT_NAME = "توسعه کسب و کار وبینا"
export const WEBINA_CREDIT_LOGO = "/brand/webina-fav.png"

/**
 * Markup and styles mirror parisma.ir exactly:
 * a right-aligned column (11px/600, #4d5e8a title + #1d2b51 linked name),
 * followed by the 35x35 Webina favicon with 7px radius, gap 13px.
 * Styles are inline so cafe/shop skins cannot restyle it.
 */
export function WebinaCredit({ className }: { className?: string }) {
  return (
    <span
      dir="rtl"
      className={cn("webina-credit footer-content__company-names-logo", className)}
      style={{ display: "flex", gap: 13, alignItems: "center", justifyContent: "flex-end", fontWeight: 600, lineHeight: 1.6 }}
    >
      <span className="footer-content__company-name" style={{ display: "flex", flexDirection: "column", alignItems: "end" }}>
        <span className="footer-content__company-name-developer" style={{ color: "#4d5e8a", fontSize: 11, fontWeight: 600 }}>
          {WEBINA_CREDIT_TITLE}
        </span>
        <a
          href={WEBINA_CREDIT_HREF}
          target="_blank"
          rel="nofollow noreferrer"
          className="footer-content__company-name-brand"
          style={{ color: "#1d2b51", fontSize: 11, fontWeight: 600, textDecoration: "none" }}
        >
          {WEBINA_CREDIT_NAME}
        </a>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={WEBINA_CREDIT_LOGO} alt={WEBINA_CREDIT_NAME} width={35} height={35} style={{ borderRadius: 7, width: 35, height: 35, display: "block" }} />
    </span>
  )
}
