import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true})
const p=await ctx.newPage()
await p.goto("https://marsbgc.ir/",{waitUntil:"networkidle",timeout:45000})
await p.waitForTimeout(2000)
const info = await p.evaluate(()=>{
  const de=document.documentElement
  const out=[]
  for(const e of document.querySelectorAll("body *")){
    const r=e.getBoundingClientRect()
    if(r.width>de.clientWidth+2 && r.height>0){
      out.push({tag:e.tagName, cls:(e.className||"").toString().slice(0,50), w:Math.round(r.width), x:Math.round(r.x),
        parent:(e.parentElement?.className||"").toString().slice(0,50), sec:(e.closest("section")?.className||"").toString().slice(0,40)})
    }
  }
  return {ov:de.scrollWidth-de.clientWidth, n:out.length, out:out.slice(0,12)}
})
console.log(JSON.stringify(info,null,1))
await b.close()
