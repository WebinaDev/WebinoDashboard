import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2})
const p=await ctx.newPage()
for (const r of ["/","/shop","/product/catan","/blog","/about"]) {
  await p.goto("https://marsbgc.ir"+r,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
  await p.waitForTimeout(1200)
  const o = await p.evaluate(()=>{
    const de=document.documentElement
    const cw=de.clientWidth
    const wide=[...document.querySelectorAll("body *")].filter(e=>{const b=e.getBoundingClientRect();return b.width>cw+2&&b.height>0&&getComputedStyle(e).position!=="fixed"&&!e.closest("[style*='overflow']")}).slice(0,4).map(e=>`${e.tagName}.${(e.className||"").toString().slice(0,30)}:${Math.round(e.getBoundingClientRect().width)}`)
    return {ov:de.scrollWidth-cw, wide, h:de.scrollHeight}
  })
  console.log(r, JSON.stringify(o))
}
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(1500)
const nav = await p.evaluate(()=>{
  const btn=document.querySelector("header button")
  return { hasToggle: !!btn, headerText: document.querySelector("header").innerText.replace(/\s+/g," ").slice(0,120) }
})
console.log("NAV:", JSON.stringify(nav))
await b.close()
