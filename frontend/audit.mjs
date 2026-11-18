import { chromium } from "playwright"
const pages = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
for (const p of pages) {
  await page.goto("https://marsbgc.ir" + p, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  const info = await page.evaluate(() => {
    const txt = document.body.innerText.replace(/\s+/g," ").trim()
    const imgs = [...document.querySelectorAll("img")]
    const broken = imgs.filter(i => !i.naturalWidth).map(i => i.currentSrc||i.src)
    return { text: txt.slice(0, 1100), imgs: imgs.length, broken, title: document.title }
  })
  console.log("=".repeat(20), p || "/")
  console.log(JSON.stringify(info, null, 1))
}
await browser.close()
