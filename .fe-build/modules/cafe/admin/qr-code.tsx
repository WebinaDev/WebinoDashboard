"use client"

import QRCode from "qrcode"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

/** QR codes are drawn in the browser; no third-party image service sees the menu links. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
}

export async function qrPng(url: string, size = 1024): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: size })
}

function download(href: string, filename: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function safeName(name: string) {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "qr"
}

export function QrCodeView({ url, name, size = 240 }: { url: string; name: string; size?: number }) {
  const t = useTranslations("cafe_admin.qr")
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    qrSvg(url).then((s) => alive && setSvg(s)).catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [url])

  if (!svg) return null
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={url} width={size} height={size} className="rounded-lg border bg-white p-2" />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const blob = new Blob([svg], { type: "image/svg+xml" })
            const href = URL.createObjectURL(blob)
            download(href, `${safeName(name)}.svg`)
            window.setTimeout(() => URL.revokeObjectURL(href), 1000)
          }}
        >
          {t("download_svg")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => qrPng(url).then((png) => download(png, `${safeName(name)}.png`))}>
          {t("download_png")}
        </Button>
      </div>
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

export type PrintableCard = { title: string; subtitle?: string | null; url: string }

/** Opens a print-ready sheet of table cards (A4, two per row) in a new window. */
export async function printTableCards(cards: PrintableCard[], opts: { heading: string; hint: string; dir: "rtl" | "ltr" }) {
  const svgs = await Promise.all(cards.map((c) => qrSvg(c.url)))
  const body = cards
    .map(
      (c, i) => `<section class="card">
  <h2>${escapeHtml(c.title)}</h2>
  ${c.subtitle ? `<p class="sub">${escapeHtml(c.subtitle)}</p>` : ""}
  <div class="qr">${svgs[i]}</div>
  <p class="hint">${escapeHtml(opts.hint)}</p>
</section>`,
    )
    .join("\n")
  const html = `<!doctype html><html dir="${opts.dir}"><head><meta charset="utf-8"><title>${escapeHtml(opts.heading)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; margin: 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
  .card { border: 1px dashed #999; border-radius: 6mm; padding: 8mm; text-align: center; break-inside: avoid; }
  .card h2 { margin: 0 0 2mm; font-size: 20pt; }
  .sub { margin: 0 0 4mm; color: #555; }
  .qr svg { width: 60mm; height: 60mm; }
  .hint { margin: 4mm 0 0; font-size: 11pt; }
</style></head><body><div class="grid">${body}</div>
<script>window.onload = () => { window.focus(); window.print(); }</script></body></html>`
  const w = window.open("", "_blank")
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
