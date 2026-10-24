import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {launchBrowser} from './run-browser.mjs';
const root='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846';
const out=root+'/public-acceptance';await fs.mkdir(out,{recursive:true});
const base='https://anatomed-mcp.vercel.app';
const result={startedAt:new Date().toISOString(),scope:'Unmodified deployed public MCP protocol and widget-preview UI. No local renderer bundle, injected scene, mocked service or substituted model.',productionImproved:false,protocol:[],views:[],checks:[],nativeHostConstraint:'Native Obsidian and Claude host apps not opened because desktop app permission was not granted. Public deployed viewer acceptance is not a claim of native-host acceptance.'};
const client=new Client({name:'anatomed-public-acceptance',version:'1.0.0'},{capabilities:{}});
let browser;
const observation=`(async()=>{await new Promise(r=>setTimeout(r,600));const c=document.querySelector('canvas');if(!c)return {canvas:false,text:document.body.innerText};const gl=c.getContext('webgl2')||c.getContext('webgl');const p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);let pixels=0;for(let i=3;i<p.length;i+=4)if(p[i])pixels++;return {canvas:true,pixels,loading:!!document.querySelector('.am-loading'),glError:gl.getError(),text:document.body.innerText}})()`;
async function clickButton(page,label){
 const point=await page.evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Button absent');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},page.sessionId);
 await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1},page.sessionId);
}
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
 const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='show_anatomy_region'));
 const resources=await client.listResources();assert.ok(resources.resources.some(r=>r.uri==='ui://anatomed/region-viewer'));
 const resource=await client.readResource({uri:'ui://anatomed/region-viewer'});assert.ok(resource.contents.some(c=>c.text?.includes('<html')));
 result.checks.push({name:'live protocol initialization, tool discovery and HTML resource retrieval',passed:true});
 const cases=[
  {key:'liver',parts:['liver'],expected:['Liver'],visible:true},
  {key:'cerebellum',parts:['cerebellum'],expected:['Cerebellum.r'],visible:false},
  {key:'popliteal-fascia',parts:['popliteal fascia'],expected:['Popliteal fascia.r'],visible:false,rotate:true},
  {key:'mixed',parts:['Femur','Femoral artery','Femoral nerve'],expected:['Femur.r','Femoral artery.r','Femoral nerve.r'],visible:true},
 ];
 for(const c of [...cases,...['organs','nervous system','vascular system'].map(q=>({key:q,parts:[q],expected:[],protocolOnly:true}))]){
  const call=await client.callTool({name:'show_anatomy_region',arguments:{parts:c.parts,detail:'isolated'}});
  const payload=call.structuredContent;
  const ids=payload?.parts?.filter(p=>!p.context).map(p=>p.id)||[];
  assert.deepEqual([...ids].sort(),[...c.expected].sort(),c.key);
  result.protocol.push({case:c.key,parts:c.parts,returnedIds:ids,unmatched:payload?.unmatched,isError:!!call.isError});
 }
 browser=await launchBrowser(out);
 for(const c of cases){
  const url=base+'/widget-preview?parts='+encodeURIComponent(c.parts.join(','));
  const page=await browser.page(url);
  await page.evaluate(`(async()=>{const t=Date.now();while(!document.querySelector('canvas')||document.querySelector('.am-loading')){if(Date.now()-t>60000)throw Error('Public viewer did not finish loading');await new Promise(r=>setTimeout(r,100))}})()`,70000);
  const before=await page.evaluate(observation);assert.equal(before.loading,false);assert.equal(before.glError,0);assert.equal(before.pixels>0,c.visible,c.key);
  const record={case:c.key,url,before};await page.screenshot(out+'/'+c.key+'-default.png');
  if(c.key==='liver'){
   await clickButton(page,'Hide all');record.hidden=await page.evaluate(observation);assert.equal(record.hidden.pixels,0);
   await clickButton(page,'Show all');record.shown=await page.evaluate(observation);assert.ok(record.shown.pixels>0);
   result.checks.push({name:'public Liver hide/show controls change visible geometry',passed:true,before:before.pixels,hidden:record.hidden.pixels,shown:record.shown.pixels});
  }
  if(c.rotate){
   await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:320,y:320,button:'left',buttons:1,clickCount:1},page.sessionId);
   for(let i=1;i<=20;i++)await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:320+i*10,y:320,button:'left',buttons:1},page.sessionId);
   await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:520,y:320,button:'left',buttons:0,clickCount:1},page.sessionId);
   record.rotated=await page.evaluate(observation);assert.ok(record.rotated.pixels>0,'Public pointer rotation must reveal fascia');
   await page.screenshot(out+'/'+c.key+'-rotated.png');result.checks.push({name:'public pointer rotation reveals initially blank fascia',passed:true,before:before.pixels,after:record.rotated.pixels});
  }
  result.views.push(record);console.log(JSON.stringify({case:c.key,before:before.pixels,afterRotation:record.rotated?.pixels,hide:record.hidden?.pixels,show:record.shown?.pixels}));
  await page.close();
 }
 result.passed=true;result.checks.push({name:'deployed outcomes reproduce positive, missing-name, broad-query and mixed-system audit predictions',passed:true});
}catch(error){result.passed=false;result.error=String(error);process.exitCode=1;console.error(error)}
finally{if(browser)await browser.close();await client.close();result.finishedAt=new Date().toISOString();await fs.writeFile(out+'/acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,error:result.error}))}
