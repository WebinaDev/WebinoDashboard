import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:1440,height:1000}})
const p=await ctx.newPage()
const bad=[]
p.on("response",r=>{ if(r.status()>=400) bad.push(`${r.status()} ${r.request().method()} ${r.url().slice(0,140)}`) })
p.on("requestfailed",r=>bad.push(`FAIL ${r.method()} ${r.url().slice(0,140)} ${r.failure()?.errorText}`))
for (const u of ["/","/shop","/product/catan","/cart","/checkout","/blog","/about"]) {
  bad.length=0
  await p.goto("https://marsbgc.ir"+u,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
  await p.waitForTimeout(1500)
  console.log("==",u, JSON.stringify([...new Set(bad)],null,0))
}
await b.close()
