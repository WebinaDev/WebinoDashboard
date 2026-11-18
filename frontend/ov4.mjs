import { chromium } from "playwright"
const b=await chromium.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]})
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
const p=await ctx.newPage()
for(const r of process.argv.slice(2)){
await p.goto("https://marsbgc.ir"+r,{waitUntil:"networkidle",timeout:45000}).catch(()=>{})
await p.waitForTimeout(1200)
const res=await p.evaluate(()=>{
  const de=document.documentElement
  const cw=de.clientWidth
  const hits=[]
  const all=document.querySelectorAll("body *")
  for(const e of all){
    const rect=e.getBoundingClientRect()
    if(rect.right>cw+0.5 && rect.width>0 && rect.height>0){
      let clipped=false,a=e.parentElement
      while(a&&a!==document.documentElement){const s=getComputedStyle(a);if(s.overflowX!=="visible"){clipped=true;break}a=a.parentElement}
      if(!clipped) hits.push({why:"self",tag:e.tagName,cls:(e.className||"").toString().slice(0,70),right:Math.round(rect.right),w:Math.round(rect.width)})
    }
    for(const ps of ["::before","::after"]){
      const s=getComputedStyle(e,ps)
      if(!s.content||s.content==="none") continue
      const w=parseFloat(s.width), l=parseFloat(s.left), rgt=parseFloat(s.right)
      // approximate: if absolutely positioned with negative right or large width
      if((Number.isFinite(rgt)&&rgt<-1)||(Number.isFinite(w)&&w>cw+0.5)){
        let clipped=false,a=e
        while(a&&a!==document.documentElement){const ss=getComputedStyle(a);if(ss.overflowX!=="visible"){clipped=true;break}a=a.parentElement}
        if(!clipped) hits.push({why:ps,tag:e.tagName,cls:(e.className||"").toString().slice(0,70),w:s.width,left:s.left,right:s.right,pos:s.position})
      }
    }
  }
  return {cw, ov:de.scrollWidth-cw, hits:hits.slice(0,20)}
})
console.log(r, JSON.stringify(res,null,1))
}
await b.close()
