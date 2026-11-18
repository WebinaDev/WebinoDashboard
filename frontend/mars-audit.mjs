import { chromium } from "playwright"
const BASE = "https://marsbgc.ir"
const routes = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
const errors = []
page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0,200)) })
page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).slice(0,200)))
const out = []
for (const r of routes) {
  errors.length = 0
  let status = 0
  try {
    const resp = await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 45000 })
    status = resp?.status() ?? 0
  } catch (e) { status = -1 }
  await page.waitForTimeout(1200)
  const info = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")]
    const broken = imgs.filter(i => i.currentSrc && !i.naturalWidth).map(i => i.currentSrc)
    const h1 = [...document.querySelectorAll("h1")].map(e=>e.textContent.trim()).slice(0,3)
    const txt = document.body.innerText.replace(/\s+/g," ").trim()
    return { title: document.title, h1, imgs: imgs.length, broken: [...new Set(broken)].slice(0,8),
      len: txt.length, txt: txt.slice(0,700), iframes: document.querySelectorAll("iframe").length }
  })
  out.push({ route: r, status, ...info, errors: [...new Set(errors)].slice(0,5) })
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
