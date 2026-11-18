"use client"

/* Generic doodle / offset-shadow widgets for the page builder (Webina).
 * Used by WebinoDashboard storefront and WebinoERP builders; keep both copies in sync. */

import Link from "next/link"

import { linkAttrs, parseRows, propNum, propStr } from "../props"
import type { WidgetNode } from "../types"
import { WIcon } from "./extra-widgets"
import "./doodle-widgets.css"

const CSS_SAFE = /^[#a-z0-9(),.\s%-]+$/i

export function safeCssColor(value: string, fallback: string): string {
  const v = value.trim()
  if (!v) return fallback
  return CSS_SAFE.test(v) ? v : fallback
}

function safeHref(href: string, fallback = "#"): string {
  const v = href.trim()
  if (!v) return fallback
  return /^(https?:|mailto:|tel:|\/|#)/i.test(v) ? v : fallback
}

const BLOB_SHAPES = new Set(["a", "b", "c", "round"])
const STICKER_POS = new Set(["tl", "tr", "bl", "br", "tc", "bc"])

export function BlobImageWidget({ widget }: { widget: WidgetNode }) {
  const src = propStr(widget.props, "src")
  const alt = propStr(widget.props, "alt", "تصویر")
  const shapeRaw = propStr(widget.props, "blobShape", "a")
  const shape = BLOB_SHAPES.has(shapeRaw) ? shapeRaw : "a"
  const borderWidth = Math.max(0, Math.min(8, propNum(widget.props, "borderWidth", 3)))
  const borderColor = safeCssColor(propStr(widget.props, "borderColor"), "#2b2230")
  const shadowX = Math.max(0, Math.min(20, propNum(widget.props, "shadowX", 8)))
  const shadowY = Math.max(0, Math.min(20, propNum(widget.props, "shadowY", 8)))
  const shadowColor = safeCssColor(propStr(widget.props, "shadowColor"), "#e85d4c")
  const frameBg = safeCssColor(propStr(widget.props, "frameBg"), "#f0a202")
  const size = Math.max(160, Math.min(560, propNum(widget.props, "size", 380)))
  const stickers = parseRows(widget.props.stickers, ["text", "position", "rotation", "bg", "color"]).filter((row) => row.text)

  const style = {
    ["--wbx-blob-bw" as string]: `${borderWidth}px`,
    ["--wbx-blob-bc" as string]: borderColor,
    ["--wbx-blob-sx" as string]: `${shadowX}px`,
    ["--wbx-blob-sy" as string]: `${shadowY}px`,
    ["--wbx-blob-sc" as string]: shadowColor,
    ["--wbx-blob-bg" as string]: frameBg,
    ["--wbx-blob-size" as string]: `${size}px`,
  }

  return (
    <div className="wbx-blob" style={style}>
      <div className={`wbx-blob-frame wbx-blob-shape-${shape}`}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} loading="lazy" decoding="async" />
        ) : (
          <div className="wbx-blob-ph" aria-label={alt}>
            {alt.slice(0, 1) || "·"}
          </div>
        )}
      </div>
      {stickers.map((row, index) => {
        const pos = STICKER_POS.has(row.position) ? row.position : index % 2 === 0 ? "tl" : "br"
        const rot = Number(row.rotation)
        const rotation = Number.isFinite(rot) ? Math.max(-25, Math.min(25, rot)) : pos === "tl" || pos === "bl" ? -6 : 5
        return (
          <span
            key={index}
            className={`wbx-blob-sticker pos-${pos}`}
            style={{
              ["--wbx-sticker-rot" as string]: `${rotation}deg`,
              ["--wbx-sticker-bg" as string]: safeCssColor(row.bg, pos === "br" || pos === "tr" ? "#3aa6b9" : "#fff"),
              ["--wbx-sticker-fg" as string]: safeCssColor(row.color, pos === "br" || pos === "tr" ? "#fff" : "#2b2230"),
              ["--wbx-sticker-bc" as string]: borderColor,
              ["--wbx-sticker-sc" as string]: borderColor,
            }}
          >
            {row.text}
          </span>
        )
      })}
    </div>
  )
}

export function TintCardsWidget({ widget }: { widget: WidgetNode }) {
  const rows = parseRows(widget.props.items, ["icon", "title", "meta", "text", "chips", "ctaLabel", "ctaHref", "tint"]).filter(
    (row) => row.title || row.text,
  )
  const columns = Math.max(1, Math.min(3, Number(propStr(widget.props, "columns", "2")) || 2))
  const borderColor = safeCssColor(propStr(widget.props, "borderColor"), "#2b2230")
  if (!rows.length) return <p className="wbx-empty">کارت‌های رنگی را در تنظیمات ویجت وارد کنید.</p>
  return (
    <ul className="wbx-tint-cards" style={{ ["--wbx-cols" as string]: columns, ["--wbx-doodle-bc" as string]: borderColor }}>
      {rows.map((row, index) => {
        const tint = safeCssColor(row.tint, ["#ffe8e3", "#e5f6f9", "#fff3d1", "#efe8ff"][index % 4])
        const chips = (row.chips || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
        const ctaLabel = row.ctaLabel || ""
        const ctaHref = row.ctaHref || ""
        return (
          <li key={index} className="wbx-tint-card" style={{ ["--wbx-tint" as string]: tint }}>
            <span className="wbx-tint-icon" aria-hidden="true">
              <WIcon name={row.icon || "badge"} size={24} />
            </span>
            <div>
              {row.title ? <h3 className="wbx-tint-title">{row.title}</h3> : null}
              {row.meta ? <p className="wbx-tint-meta">{row.meta}</p> : null}
            </div>
            {ctaLabel ? (
              <Link href={safeHref(ctaHref)} className="wbx-tint-cta" {...linkAttrs({ ctaHref }, "ctaHref")}>
                {ctaLabel}
              </Link>
            ) : (
              <span />
            )}
            {row.text ? <p className="wbx-tint-desc">{row.text}</p> : null}
            {chips.length ? (
              <div className="wbx-tint-meta-row">
                {chips.map((chip, chipIndex) => (
                  <span key={chipIndex} className={`wbx-tint-chip${chipIndex === chips.length - 1 ? " is-accent" : ""}`}>
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function CircleBadgesWidget({ widget }: { widget: WidgetNode }) {
  const rows = parseRows(widget.props.items, ["label", "sublabel", "bg", "shadowColor"]).filter((row) => row.label)
  const size = Math.max(80, Math.min(200, propNum(widget.props, "size", 140)))
  const borderColor = safeCssColor(propStr(widget.props, "borderColor"), "#2b2230")
  if (!rows.length) return <p className="wbx-empty">نشان‌های دایره‌ای را در تنظیمات ویجت وارد کنید.</p>
  const defaultsBg = ["#ffffff", "#ffe8e3", "#e5f6f9", "#fff3d1"]
  const defaultsSc = ["#3aa6b9", "#e85d4c", "#3aa6b9", "#f0a202"]
  return (
    <ul className="wbx-circle-badges" style={{ ["--wbx-circle-size" as string]: `${size}px`, ["--wbx-doodle-bc" as string]: borderColor }}>
      {rows.map((row, index) => (
        <li
          key={index}
          className="wbx-circle-badge"
          style={{
            ["--wbx-circle-bg" as string]: safeCssColor(row.bg, defaultsBg[index % defaultsBg.length]),
            ["--wbx-circle-sc" as string]: safeCssColor(row.shadowColor, defaultsSc[index % defaultsSc.length]),
          }}
        >
          <span>
            <b>{row.label}</b>
            {row.sublabel ? <small>{row.sublabel}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
