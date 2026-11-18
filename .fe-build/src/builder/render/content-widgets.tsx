"use client"

/* Content widgets for landing/service pages (shared with WebinoERP):
 * section heading, numbered steps/timeline, icon cards grid (optionally prefilling a form), trust badges,
 * CTA banner and a two-column comparison table.
 * Repeater props use the shared legacy line format (`a|b|c` per line), so they edit with the
 * same RepeaterInput as the ported Dashboard widgets. */

import { Clock } from "lucide-react"
import Link from "next/link"

import { linkAttrs, parseRows, propStr } from "../props"
import type { WidgetNode } from "../types"
import { WIcon } from "./extra-widgets"
import "./content-widgets.css"
import "./doodle-widgets.css"
import { safeCssColor } from "./doodle-widgets"

function safeHref(href: string, fallback = "#"): string {
  const v = href.trim()
  if (!v) return fallback
  return /^(https?:|mailto:|tel:|\/|#)/i.test(v) ? v : fallback
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const faNum = (n: number) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)])

function align(widget: WidgetNode): string {
  const value = propStr(widget.props, "align", "center")
  return value === "start" ? "wbx-align-start" : value === "end" ? "wbx-align-end" : "wbx-align-center"
}

export function SectionHeadingWidget({ widget }: { widget: WidgetNode }) {
  const eyebrow = propStr(widget.props, "eyebrow")
  const title = propStr(widget.props, "title")
  const subtitle = propStr(widget.props, "subtitle")
  const text = propStr(widget.props, "text")
  const tag = propStr(widget.props, "tag", "h2")
  const Tag = (tag === "h1" || tag === "h3" ? tag : "h2") as "h1" | "h2" | "h3"
  const eyebrowStyle = propStr(widget.props, "eyebrowStyle", "soft")
  const eyebrowPill = eyebrowStyle === "pill"
  const eyebrowCss = eyebrowPill
    ? {
        ["--wbx-eyebrow-bg" as string]: safeCssColor(propStr(widget.props, "eyebrowBg"), "#3aa6b9"),
        ["--wbx-eyebrow-fg" as string]: safeCssColor(propStr(widget.props, "eyebrowColor"), "#fff"),
        ["--wbx-eyebrow-bc" as string]: safeCssColor(propStr(widget.props, "eyebrowBorderColor"), "#2b2230"),
        ["--wbx-eyebrow-bw" as string]: `${Math.max(1, Math.min(5, Number(propStr(widget.props, "eyebrowBorderWidth", "2")) || 2))}px`,
      }
    : undefined
  return (
    <header className={`wbx-heading ${align(widget)} wbx-heading-${Tag}`}>
      {eyebrow ? <span className={eyebrowPill ? "wbx-eyebrow wbx-eyebrow-pill" : "wbx-eyebrow"} style={eyebrowCss}>{eyebrow}</span> : null}
      {title ? <Tag className="wbx-heading-title">{title}</Tag> : null}
      {subtitle ? <p className="wbx-heading-subtitle">{subtitle}</p> : null}
      {text ? <p className="wbx-heading-text">{text}</p> : null}
      {propStr(widget.props, "linkLabel") ? (
        <Link href={safeHref(propStr(widget.props, "linkHref", "#"))} className="wbx-heading-link" {...linkAttrs(widget.props, "linkHref")}>
          {propStr(widget.props, "linkLabel")}
        </Link>
      ) : null}
    </header>
  )
}

export function StepsWidget({ widget }: { widget: WidgetNode }) {
  const rows = parseRows(widget.props.items, ["title", "text"]).filter((row) => row.title)
  const vertical = propStr(widget.props, "layout", "horizontal") === "vertical"
  const note = propStr(widget.props, "note")
  if (!rows.length) return <p className="wbx-empty">مراحل را در تنظیمات ویجت وارد کنید (عنوان|توضیح).</p>
  return (
    <div className="wbx-steps-wrap">
      <ol className={`wbx-steps ${vertical ? "wbx-steps-vertical" : "wbx-steps-horizontal"}`} style={{ ["--wbx-count" as string]: rows.length }}>
        {rows.map((row, index) => (
          <li key={index} className="wbx-step">
            <span className="wbx-step-num" aria-hidden="true">{faNum(index + 1)}</span>
            <div className="wbx-step-body">
              <h3 className="wbx-step-title">
                <span className="sr-only">مرحله {faNum(index + 1)}: </span>
                {row.title}
              </h3>
              {row.text ? <p className="wbx-step-text">{row.text}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      {note ? (
        <p className="wbx-note">
          <Clock size={18} aria-hidden="true" />
          <span>{note}</span>
        </p>
      ) : null}
    </div>
  )
}

export function IconCardsWidget({ widget }: { widget: WidgetNode }) {
  const rows = parseRows(widget.props.items, ["icon", "title", "text", "prefill", "href"]).filter((row) => row.title || row.text)
  const columns = Math.max(1, Math.min(5, Number(propStr(widget.props, "columns", "3")) || 3))
  const variant = propStr(widget.props, "variant", "card")
  const cardStyle = propStr(widget.props, "cardStyle", "default")
  const doodle = cardStyle === "doodle"
  const anchor = propStr(widget.props, "anchor").replace(/[^\w-]/g, "")
  if (!rows.length) return <p className="wbx-empty">کارت‌ها را در تنظیمات ویجت وارد کنید (آیکن|عنوان|متن).</p>
  const doodleStyle = doodle
    ? {
        ["--wbx-cols" as string]: columns,
        ["--wbx-doodle-bw" as string]: `${Math.max(1, Math.min(8, Number(propStr(widget.props, "borderWidth", "3")) || 3))}px`,
        ["--wbx-doodle-bc" as string]: safeCssColor(propStr(widget.props, "borderColor"), "#2b2230"),
        ["--wbx-doodle-sx" as string]: `${Math.max(0, Math.min(16, Number(propStr(widget.props, "shadowX", "6")) || 6))}px`,
        ["--wbx-doodle-sy" as string]: `${Math.max(0, Math.min(16, Number(propStr(widget.props, "shadowY", "6")) || 6))}px`,
        ["--wbx-doodle-sc" as string]: safeCssColor(propStr(widget.props, "shadowColor"), "#3aa6b9"),
        ["--wbx-doodle-radius" as string]: `${Math.max(8, Math.min(40, Number(propStr(widget.props, "radius", "24")) || 24))}px`,
      }
    : { ["--wbx-cols" as string]: columns }
  return (
    <ul className={`wbx-cards wbx-cards-${variant}${doodle ? " wbx-cards-doodle" : ""}`} style={doodleStyle}>
      {rows.map((row, index) => {
        const inner = (
          <>
            <span className="wbx-card-icon">
              <WIcon name={row.icon || (variant === "check" ? "check" : "badge")} size={variant === "check" ? 18 : 22} />
            </span>
            <span className="wbx-card-body">
              {row.title ? <strong className="wbx-card-title">{row.title}</strong> : null}
              {row.text ? <span className="wbx-card-text">{row.text}</span> : null}
            </span>
          </>
        )
        const href = (row.href || "").trim()
        if (href) {
          return (
            <li key={index} className="wbx-card wbx-card-action">
              <a href={safeHref(href)} className="wbx-card-button wbx-card-link" {...linkAttrs({ href }, "href")}>
                {inner}
              </a>
            </li>
          )
        }
        const match = row.prefill.match(/^([\w.-]+)\s*=\s*(.*)$/)
        if (!match && !anchor) return <li key={index} className="wbx-card">{inner}</li>
        return (
          <li key={index} className="wbx-card wbx-card-action">
            <button
              type="button"
              className="wbx-card-button"
              onClick={() => {
                if (match) window.dispatchEvent(new CustomEvent("wb:form-prefill", { detail: { anchor, name: match[1], value: match[2].trim() } }))
                if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
            >
              {inner}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function CalloutWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title")
  const text = propStr(widget.props, "text")
  const icon = propStr(widget.props, "icon", "badge")
  const variant = propStr(widget.props, "variant", "soft")
  const tone = propStr(widget.props, "tone", "brand")
  const label = propStr(widget.props, "buttonLabel")
  const href = propStr(widget.props, "buttonHref", "#")
  if (!title && !text) return <p className="wbx-empty">عنوان یا متن باکس را در تنظیمات ویجت وارد کنید.</p>
  const toneClass = ["brand", "info", "success", "warning", "muted"].includes(tone) ? tone : "brand"
  const variantClass = ["soft", "solid", "outline"].includes(variant) ? variant : "soft"
  return (
    <aside className={`wbx-callout wbx-callout-${variantClass} wbx-callout-${toneClass}`}>
      <span className="wbx-callout-icon" aria-hidden="true">
        <WIcon name={icon || "badge"} size={22} />
      </span>
      <div className="wbx-callout-body">
        {title ? <strong className="wbx-callout-title">{title}</strong> : null}
        {text ? <p className="wbx-callout-text">{text}</p> : null}
        {label ? (
          <a href={safeHref(href)} className="wbx-callout-btn" {...linkAttrs(widget.props, "buttonHref")}>
            {label}
          </a>
        ) : null}
      </div>
    </aside>
  )
}

export function BadgesWidget({ widget }: { widget: WidgetNode }) {
  const rows = parseRows(widget.props.items, ["icon", "text"]).filter((row) => row.text)
  if (!rows.length) return null
  return (
    <ul className={`wbx-badges ${align(widget)}`}>
      {rows.map((row, index) => (
        <li key={index} className="wbx-badge">
          <WIcon name={row.icon || "check-circle"} size={16} />
          <span>{row.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function CtaBannerWidget({ widget }: { widget: WidgetNode }) {
  const title = propStr(widget.props, "title")
  const text = propStr(widget.props, "text")
  const label = propStr(widget.props, "label")
  const href = propStr(widget.props, "href", "#")
  const secondary = propStr(widget.props, "secondaryLabel")
  const tone = propStr(widget.props, "tone", "primary")
  const borderStyle = propStr(widget.props, "borderStyle", "none")
  const dashed = borderStyle === "dashed"
  const from = safeCssColor(propStr(widget.props, "gradientFrom"), "#ffe8e3")
  const via = safeCssColor(propStr(widget.props, "gradientVia"), "#e5f6f9")
  const to = safeCssColor(propStr(widget.props, "gradientTo"), "#fff3d1")
  const borderColor = safeCssColor(propStr(widget.props, "borderColor"), "#2b2230")
  const ctaStyle = dashed
    ? {
        ["--wbx-cta-grad" as string]: `linear-gradient(135deg, ${from}, ${via} 50%, ${to})`,
        ["--wbx-cta-bc" as string]: borderColor,
        ["--wbx-cta-sc" as string]: borderColor,
      }
    : undefined
  return (
    <div className={`wbx-cta wbx-cta-${tone}${dashed ? " wbx-cta-dashed" : ""}`} style={ctaStyle}>
      {title ? <h2 className="wbx-cta-title">{title}</h2> : null}
      {text ? <p className="wbx-cta-text">{text}</p> : null}
      {label ? (
        <Link href={safeHref(href)} className="wbx-cta-btn" {...linkAttrs(widget.props, "href")}>
          {label}
        </Link>
      ) : null}
      {secondary ? (
        <Link href={safeHref(propStr(widget.props, "secondaryHref", "#"))} className="wbx-cta-link" {...linkAttrs(widget.props, "secondaryHref")}>
          {secondary}
        </Link>
      ) : null}
    </div>
  )
}

export function ComparisonTableWidget({ widget }: { widget: WidgetNode }) {
  const rows = parseRows(widget.props.rows, ["a", "b"]).filter((row) => row.a || row.b)
  const colA = propStr(widget.props, "colA")
  const colB = propStr(widget.props, "colB")
  const highlight = propStr(widget.props, "highlight", "b")
  if (!rows.length) return <p className="wbx-empty">ردیف‌های جدول را وارد کنید (ستون اول|ستون دوم).</p>
  return (
    <div className="wbx-compare-wrap">
      <table className={`wbx-compare wbx-compare-hl-${highlight || "none"}`}>
        <thead>
          <tr>
            <th scope="col">{colA}</th>
            <th scope="col">{colB}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td data-label={colA}>{row.a}</td>
              <td data-label={colB}>{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
