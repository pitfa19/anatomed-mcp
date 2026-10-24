import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Local headless Chrome protocol connection, no packages or remote service. */
export async function launchBrowser(outputRoot) {
  await fs.mkdir(outputRoot,{recursive:true});
  const chrome=process.env.AUDIT_CHROME || '/Users/fabijanpitlovic/.cache/puppeteer/chrome-headless-shell/mac_arm-155.0.8059.79/chrome-headless-shell-mac-arm64/chrome-headless-shell';
  const child=spawn(chrome,['--remote-debugging-pipe','--headless','--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--window-size=900,800',`--user-data-dir=${path.join(outputRoot,'browser-profile-'+Date.now())}`],{stdio:['ignore','ignore','pipe','pipe','pipe']});
  const pending=new Map(); const listeners=new Set(); let id=0,buffer=Buffer.alloc(0),stderr='';
  child.stderr.on('data',b=>{stderr+=b.toString();if(stderr.length>100000)stderr=stderr.slice(-100000)});
  const fail=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e)}pending.clear()};
  child.on('error',fail);child.on('exit',(code,signal)=>fail(Error(`Chrome exited ${code}/${signal}: ${stderr.slice(-2000)}`)));
  child.stdio[4].on('data',b=>{buffer=Buffer.concat([buffer,b]);let at;while((at=buffer.indexOf(0))>=0){const text=buffer.subarray(0,at).toString();buffer=buffer.subarray(at+1);if(!text)continue;const m=JSON.parse(text);if(m.id){const p=pending.get(m.id);if(!p)continue;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else{for(const fn of listeners)fn(m)}}});
  function send(method,params={},sessionId,timeout=120000){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(`CDP timeout ${method}`))},timeout);pending.set(n,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})})+'\0')})}
  const version=await send('Browser.getVersion');console.log('BROWSER '+JSON.stringify(version));
  async function page(url){const {targetId}=await send('Target.createTarget',{url:'about:blank',width:900,height:800});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:900,height:800,deviceScaleFactor:1,mobile:false},sessionId);const loaded=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{listeners.delete(onload);reject(Error('Navigation load timeout '+url))},60000);function onload(m){if(m.sessionId===sessionId&&m.method==='Page.loadEventFired'){clearTimeout(timer);listeners.delete(onload);resolve()}}listeners.add(onload)});await send('Page.navigate',{url},sessionId);await loaded;return{targetId,sessionId,evaluate:async(expression,timeout=120000)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId,timeout);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value},screenshot:async(file)=>{const r=await send('Page.captureScreenshot',{format:'png'},sessionId);await fs.writeFile(file,Buffer.from(r.data,'base64'))},close:()=>send('Target.closeTarget',{targetId})}}
  return {send,page,listeners,version,close:async()=>{await fs.writeFile(path.join(outputRoot,'browser-stderr.txt'),stderr);try{await send('Browser.close',{},undefined,10000)}catch{}child.kill();}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [url='about:blank',expression='({title:document.title,webgl:!!document.createElement("canvas").getContext("webgl2")})',out='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/browser-check']=process.argv.slice(2);
 const browser=await launchBrowser(out);
 browser.listeners.add(m=>{if(m.method==='Runtime.consoleAPICalled')console.log('PAGE '+m.params.args.map(a=>a.value??a.description).join(' '));if(m.method==='Runtime.exceptionThrown')console.log('PAGE_EXCEPTION '+JSON.stringify(m.params.exceptionDetails))});
 try{const page=await browser.page(url);const value=await page.evaluate(`new Promise(resolve=>{const done=()=>resolve(true);document.readyState==='complete'?done():window.addEventListener('load',done,{once:true})})`);console.log('LOADED',value);const result=await page.evaluate(expression,7200000);await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log('RESULT '+JSON.stringify(result));await page.screenshot(path.join(out,'final.png'));}finally{await browser.close()}
}
