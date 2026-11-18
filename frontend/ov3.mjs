import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const p=await ctx.newPage()
for(const r of process.argv.slice(2)){
await p.goto("https://marsbgc.ir"+r,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
for(const t of [300,1500,3000,5000]){
  await p.waitForTimeout(t===300?300:t-300)
  const o=await p.evaluate(()=>{const de=document.documentElement;return {ov:de.scrollWidth-de.clientWidth}})
  console.log(r,t,JSON.stringify(o))
}
}
await b.close()
