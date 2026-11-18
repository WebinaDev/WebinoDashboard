import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:1440,height:1000}})
const p=await ctx.newPage()
// PDP specs
await p.goto("https://marsbgc.ir/product/catan",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(1500)
const tab = p.locator("button",{hasText:"مشخصات"}).first()
await tab.click(); await p.waitForTimeout(600)
const spec = await p.evaluate(()=>document.body.innerText.includes("تعداد بازیکن") && document.body.innerText.includes("۶۰ تا ۹۰ دقیقه"))
console.log("SPEC_TAB:", spec)
// blog post html
await p.goto("https://marsbgc.ir/blog/two-player-board-games",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(1200)
const post = await p.evaluate(()=>({
  hasH3: document.querySelectorAll("article h3, .prose h3").length,
  rawTags: document.body.innerText.includes("<h3>"),
  date: (document.body.innerText.match(/\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2} [^\n]{3,10} \d{4}/)||[""])[0],
  text: document.body.innerText.replace(/\s+/g," ").slice(0,180)
}))
console.log("POST:", JSON.stringify(post))
// footer columns + header menu
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(2500)
const chrome = await p.evaluate(()=>{
  const f=document.querySelector("footer")
  const h=document.querySelector("header")
  return { footerLinks:[...f.querySelectorAll("a")].map(a=>a.textContent.trim()).slice(0,20),
           headerLinks:[...h.querySelectorAll("a")].map(a=>a.textContent.trim()).slice(0,12) }
})
console.log("CHROME:", JSON.stringify(chrome))
await b.close()
