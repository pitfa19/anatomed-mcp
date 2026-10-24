import fs from 'node:fs/promises';
import {launchBrowser} from './run-browser.mjs';
const out='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/live-preview';await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(out);const rows=[];
try{for(const query of ['Liver','Cerebellum.r','Abdominal aorta','Sciatic nerve.r','Heart','Kidney.r']){
 const page=await browser.page('https://anatomed-mcp.vercel.app/widget-preview?parts='+encodeURIComponent(query));
 const errors=[];const listener=m=>{if(m.sessionId===page.sessionId&&m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)};browser.listeners.add(listener);
 const result=await page.evaluate(`(async()=>{const start=Date.now();while((!document.querySelector('canvas')||document.querySelector('.am-loading'))&&Date.now()-start<45000)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,400));const canvas=document.querySelector('canvas');if(!canvas)return {error:'no canvas',text:document.body.innerText};const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)opaque++;return {width:canvas.width,height:canvas.height,modelPixels:opaque,loading:!!document.querySelector('.am-loading'),glError:gl.getError(),text:document.body.innerText}})()`,60000);
 await page.screenshot(out+'/'+query.replace(/[^a-z0-9]/gi,'_')+'.png');rows.push({query,...result,errors});console.log(JSON.stringify(rows.at(-1)));browser.listeners.delete(listener);await page.close();
}}finally{await browser.close();await fs.writeFile(out+'/results.json',JSON.stringify(rows,null,2))}
