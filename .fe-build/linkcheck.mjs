import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:1440,height:1000}})
const p=await ctx.newPage()
const links=new Set()
for (const u of ["/","/shop","/product/catan","/cart","/blog","/about","/shipping","/privacy"]) {
  await p.goto("https://marsbgc.ir"+u,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
  await p.waitForTimeout(700)
  for (const h of await p.evaluate(()=>[...document.querySelectorAll("a[href]")].map(a=>a.getAttribute("href")))) {
    if (h && h.startsWith("/") && !h.startsWith("//")) links.add(h.split("#")[0])
  }
}
const results=[]
for (const l of [...links].sort()) {
  const r = await ctx.request.get("https://marsbgc.ir"+l, {maxRedirects:0}).catch(e=>({status:()=>-1}))
  results.push([r.status(), l])
}
const bad = results.filter(([s])=>s>=400||s<0)
console.log("total links", results.length, "bad", bad.length)
console.log(JSON.stringify(bad,null,1))
await b.close()
