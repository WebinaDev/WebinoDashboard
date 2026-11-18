import { chromium } from "playwright"
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"] })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
await page.goto("https://marsbgc.ir/product/catan", { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(2500)
const tabs = await page.$$("button")
for (const t of tabs) {
  const label = (await t.textContent())?.trim()
  if (label === "مشخصات") { await t.click(); await page.waitForTimeout(800); break }
}
const out = await page.evaluate(() => ({
  spec: document.body.innerText.includes("تعداد بازیکن"),
  galleryThumbs: document.querySelectorAll(".sf-pdp button img").length,
  images: [...document.querySelectorAll("img")].map(i=>i.currentSrc||i.src).filter(s=>s.includes("storage/media")),
}))
console.log(JSON.stringify(out, null, 1))
await browser.close()
