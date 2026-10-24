import fs from 'node:fs/promises';
import {launchBrowser} from './run-browser.mjs';
const out='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/live-mixed';
await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(out);
try {
 const query='Femur,Femoral artery,Femoral nerve';
 const page=await browser.page('https://anatomed-mcp.vercel.app/widget-preview?parts='+encodeURIComponent(query));
 const errors=[];
 const listener=m=>{if(m.sessionId===page.sessionId&&m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)};
 browser.listeners.add(listener);
 const result=await page.evaluate(`(async()=>{const start=Date.now();while((!document.querySelector('canvas')||document.querySelector('.am-loading'))&&Date.now()-start<60000)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,1500));const canvas=document.querySelector('canvas');if(!canvas)return {error:'no canvas',text:document.body.innerText};const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)opaque++;return {width:canvas.width,height:canvas.height,modelPixels:opaque,loading:!!document.querySelector('.am-loading'),glError:gl.getError(),text:document.body.innerText}})()`,75000);
 await page.screenshot(out+'/femur-artery-nerve.png');
 const row={query,...result,errors,note:'Mixed-system live smoke test and visual alignment evidence, not proof of clinical anatomical accuracy or complete visibility of occluded parts.'};
 await fs.writeFile(out+'/results.json',JSON.stringify(row,null,2));
 console.log(JSON.stringify(row));
 if(!result.modelPixels||result.loading||result.glError||errors.length)throw new Error('Mixed live viewer smoke check failed');
 await page.close();
}finally{await browser.close()}
