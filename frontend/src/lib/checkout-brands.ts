/**
 * Self-hosted checkout brand marks (gateways + carriers).
 * Served from /checkout-brands/* so every storefront theme can reuse them.
 */

const BASE = "/checkout-brands"

const GATEWAY_FILES: Record<string, string> = {
  zarinpal: "zarinpal.svg",
  zibal: "zibal.svg",
  digipay: "digipay.svg",
  snapppay: "snapppay.svg",
  torobpay: "torobpay.svg",
  bale_pay: "bale_pay.svg",
  basalam_pay: "basalam_pay.svg",
  wallet: "wallet.svg",
  cod: "cod.svg",
  cheque: "cheque.svg",
  c2c: "c2c.svg",
}

const SHIPPING_FILES: Array<{ test: RegExp; file: string }> = [
  { test: /تیپاکس|tipax/i, file: "tipax.svg" },
  { test: /پیک|موتور|courier|peyk|bike|moto/i, file: "peyk.svg" },
  { test: /پیشتاز|(^|[^\u0600-\u06FF])پست([^\u0600-\u06FF]|$)|\bpost\b|pishtaz|iran\s*post/i, file: "post.svg" },
  { test: /چاپار|chapar/i, file: "shipping.svg" },
  { test: /ماکس|max/i, file: "shipping.svg" },
]

export function gatewayBrandSrc(id: string | null | undefined): string {
  const key = String(id || "").toLowerCase().trim()
  const file = GATEWAY_FILES[key] || "card.svg"
  return `${BASE}/${file}`
}

export function shippingBrandSrc(input: {
  title?: string | null
  method_id?: string | null
  service?: string | null
}): string {
  const hay = [input.method_id, input.service, input.title].filter(Boolean).join(" ")
  for (const row of SHIPPING_FILES) {
    if (row.test.test(hay)) return `${BASE}/${row.file}`
  }
  return `${BASE}/shipping.svg`
}

export function gatewayBrandAlt(id: string, title?: string | null): string {
  return title?.trim() || id
}
