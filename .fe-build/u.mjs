import { chromium } from "playwright"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
for (const u of ["/", "/subscribe", "/faq", "/contact", "/shop"]) {
  await p.goto("https://alikhabari.ir" + u, { waitUntil: "domcontentloaded", timeout: 90000 })
  await p.waitForTimeout(2500)
  const r = await p.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/\\u[0-9a-f]{4}/g) || []
    return { count: m.length, sample: t.slice(Math.max(0, t.indexOf("\\u") - 60), t.indexOf("\\u") + 120) }
  })
  console.log(u, JSON.stringify(r))
}
await b.close()
