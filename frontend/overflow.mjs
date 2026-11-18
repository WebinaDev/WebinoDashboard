import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const p=await ctx.newPage()
for (const r of process.argv.slice(2)) {
await p.goto("https://marsbgc.ir"+r,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
await p.waitForTimeout(800)
const res=await p.evaluate(()=>{
  const de=document.documentElement
  const cw=de.clientWidth
  const out=[]
  document.querySelectorAll("body *").forEach(e=>{
    const rect=e.getBoundingClientRect()
    if(rect.width===0||rect.height===0) return
    if(rect.right>cw+1||rect.left<-1){
      // find nearest scrollable/clipping ancestor
      let clipped=false, a=e.parentElement
      while(a){const s=getComputedStyle(a); if(s.overflowX!=="visible"){clipped=true;break} a=a.parentElement}
      if(!clipped) out.push({tag:e.tagName,cls:(e.className||"").toString().slice(0,60),left:Math.round(rect.left),right:Math.round(rect.right),w:Math.round(rect.width),txt:(e.textContent||"").trim().slice(0,30)})
    }
  })
  return {cw, overflowX: de.scrollWidth-cw, count: out.length, out: out.slice(0,15)}
})
console.log(r, JSON.stringify(res,null,1))
}
await b.close()
