import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const p=await ctx.newPage()
for(const r of process.argv.slice(2)){
await p.goto("https://marsbgc.ir"+r,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
await p.waitForTimeout(1200)
const res=await p.evaluate(()=>{
  const de=document.documentElement
  const hits=[]
  for(const e of document.querySelectorAll("body *")){
    const rect=e.getBoundingClientRect()
    if(rect.width>0&&rect.height>0&&(rect.left<-0.5||rect.right>de.clientWidth+0.5)){
      hits.push({tag:e.tagName,cls:(e.className||"").toString().slice(0,64),left:Math.round(rect.left),right:Math.round(rect.right),w:Math.round(rect.width),pos:getComputedStyle(e).position})
    }
  }
  return {ov:de.scrollWidth-de.clientWidth, scrollLeft:de.scrollLeft, bodyScrollLeft:document.body.scrollLeft, n:hits.length, hits}
})
console.log("==",r)
console.log(JSON.stringify(res.hits.slice(0,10),null,1))
console.log("ov",res.ov,"n",res.n,"scrollLeft",res.scrollLeft,res.bodyScrollLeft)
}
await b.close()
