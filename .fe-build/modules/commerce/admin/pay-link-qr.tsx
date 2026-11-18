"use client"

import QRCode from "qrcode"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
}

async function qrPng(url: string, size = 512): Promise<string> {
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

/** Compact QR for pay-link / POS payment URLs. */
export function PayLinkQr({
  url,
  downloadSvgLabel,
  downloadPngLabel,
  size = 200,
}: {
  url: string
  downloadSvgLabel: string
  downloadPngLabel: string
  size?: number
}) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    qrSvg(url)
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [url])

  if (!svg) return null
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} className="rounded-lg border bg-white p-2" />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const blob = new Blob([svg], { type: "image/svg+xml" })
            const href = URL.createObjectURL(blob)
            download(href, "pay-link.svg")
            window.setTimeout(() => URL.revokeObjectURL(href), 1000)
          }}
        >
          {downloadSvgLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void qrPng(url).then((png) => download(png, "pay-link.png"))}
        >
          {downloadPngLabel}
        </Button>
      </div>
    </div>
  )
}
