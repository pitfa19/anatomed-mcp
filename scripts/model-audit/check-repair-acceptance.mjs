import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {launchBrowser} from './run-browser.mjs';

// Public interfaces only: the real HTTP app, protocol, widget preview and UI controls.
// Explicit output directory prevents overwriting the original defect baseline.
const [base, out] = process.argv.slice(2);
if (!base || !out || !path.isAbsolute(out)) throw Error('Usage: node check-repair-acceptance.mjs BASE_URL ABSOLUTE_OUTPUT');
await fs.mkdir(out, {recursive:true});
const catalog = JSON.parse(await fs.readFile(new URL('../../assets/parts-catalog.json', import.meta.url), 'utf8'));
const lymph = catalog.parts.find(p => p.system === 'lymphoid');
assert.ok(lymph, 'Repaired catalog must include lymphoid anatomy');
const result = {startedAt:new Date().toISOString(), base, scope:'Unmodified HTTP app via actual MCP protocol and served widget UI, not the instrumented viewer harness.', protocol:[], views:[], checks:[], passed:false};
const client = new Client({name:'anatomed-repair-acceptance',version:'2.0.0'}, {capabilities:{}});
let browser;
const observation = `(async()=>{await new Promise(r=>setTimeout(r,650));const c=document.querySelector('canvas');if(!c)return {canvas:false,text:document.body.innerText};const gl=c.getContext('webgl2')||c.getContext('webgl');const p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);let pixels=0;for(let i=3;i<p.length;i+=4)if(p[i])pixels++;return {canvas:true,pixels,width:c.width,height:c.height,loading:!!document.querySelector('.am-loading'),glError:gl.getError(),text:document.body.innerText}})()`;
async function clickButton(page,label) {
  const point=await page.evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('Missing button: '+${JSON.stringify(label)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},page.sessionId);
  await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1},page.sessionId);
}
const cases = [
  {key:'liver',parts:['liver'],expected:['Liver']},
  {key:'cerebellum-right',parts:['Cerebellum.r'],composite:true,side:'r'},
  {key:'cerebellum-left',parts:['left cerebellum'],composite:true,side:'l'},
  {key:'kidney-exact',parts:['Kidney.r'],expected:['Kidney.r']},
  {key:'kidney-left',parts:['left kidney'],expected:['Kidney.l']},
  {key:'sciatic-left',parts:['left sciatic nerve'],expected:['Sciatic nerve.l']},
  {key:'popliteal-fascia',parts:['popliteal fascia'],expected:['Popliteal fascia.r'],rotate:true},
  {key:'mixed',parts:['Femur','Femoral artery','Femoral nerve'],expected:['Femur.r','Femoral artery.r','Femoral nerve.r']},
  {key:'lymphoid',parts:[lymph.id],expected:[lymph.id]},
  {key:'restored-nasopharynx',parts:['Nasopharynx'],expected:['Nasopharynx']},
  {key:'restored-bursa',parts:['Anserine bursa.l'],expected:['Anserine bursa.l']},
];
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
  const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='show_anatomy_region'));
  const resources=await client.listResources();assert.ok(resources.resources.some(r=>r.uri==='ui://anatomed/region-viewer'));
  const resource=await client.readResource({uri:'ui://anatomed/region-viewer'});assert.ok(resource.contents.some(c=>c.text?.includes('<html')));
  result.checks.push({name:'protocol initialize, tools, resources and actual served HTML',passed:true});
  for(const c of [...cases,...['organs','nervous system','vascular system'].map(q=>({key:q,parts:[q],expected:[],unsupported:true}))]) {
    const call=await client.callTool({name:'show_anatomy_region',arguments:{parts:c.parts,detail:'isolated'}});
    const payload=call.structuredContent;
    const parts=payload?.parts?.filter(p=>!p.context)||[];
    const ids=parts.map(p=>p.id);
    if(c.expected) assert.deepEqual([...ids].sort(),[...c.expected].sort(),c.key);
    if(c.composite) {
      assert.ok(parts.length>1 && parts.length<=60, c.key+' bounded explicit composite');
      assert.ok(parts.every(p=>p.system==='nerves'),c.key+' nervous structures only');
      const opposite=c.side==='r'?'l':'r';
      assert.ok(parts.every(p=>!p.id.endsWith('.'+opposite)),c.key+' no opposite side');
    }
    if(c.unsupported) assert.ok(payload?.issues?.length || /specific|bounded|individual|whole.system|not supported/i.test(JSON.stringify(call.content)),c.key+' explains scope');
    else assert.equal(!!call.isError,false,c.key);
    assert.ok(payload.assetBase.includes('/releases/2026-10-24-v2'), 'Payload selects immutable repaired asset release');
    result.protocol.push({case:c.key,queries:c.parts,returnedIds:ids,issues:payload.issues,unmatched:payload.unmatched,assetBase:payload.assetBase,isError:!!call.isError});
  }
  const assetBase=result.protocol.find(r=>r.returnedIds.length)?.assetBase;
  const response=await fetch(assetBase+'/parts-catalog.json');assert.equal(response.status,200);
  const hostedCatalog=Buffer.from(await response.arrayBuffer());
  const localCatalog=await fs.readFile(new URL('../../assets/parts-catalog.json',import.meta.url));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(hash(hostedCatalog),hash(localCatalog),'served catalog matches tested release');
  result.checks.push({name:'remote versioned catalog byte equality',passed:true,sha256:hash(hostedCatalog)});
  browser=await launchBrowser(out);
  for(const c of cases) {
    const url=base+'/widget-preview?parts='+encodeURIComponent(c.parts.join(','));
    const page=await browser.page(url);
    await page.evaluate(`(async()=>{const t=Date.now();while(!document.querySelector('canvas')||document.querySelector('.am-loading')){if(Date.now()-t>90000)throw Error('Public viewer did not finish loading');await new Promise(r=>setTimeout(r,100))}})()`,100000);
    const before=await page.evaluate(observation);
    assert.equal(before.loading,false);assert.equal(before.glError,0);assert.ok(before.pixels>0,c.key+' visible on first load');
    const record={case:c.key,url,before};await page.screenshot(out+'/'+c.key+'-default.png');
    if(c.key==='liver') {
      await clickButton(page,'Hide all');record.hidden=await page.evaluate(observation);assert.equal(record.hidden.pixels,0);
      await clickButton(page,'Show all');record.shown=await page.evaluate(observation);assert.ok(record.shown.pixels>0);
      await clickButton(page,'Related');record.related=await page.evaluate(observation);assert.ok(record.related.pixels>0);
      await clickButton(page,'Isolated');record.isolated=await page.evaluate(observation);assert.ok(record.isolated.pixels>0);
      result.checks.push({name:'real hide/show and detail controls retain visible anatomy',passed:true});
    }
    if(c.rotate) {
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:320,y:320,button:'left',buttons:1,clickCount:1},page.sessionId);
      for(let i=1;i<=20;i++)await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:320+i*10,y:320,button:'left',buttons:1},page.sessionId);
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:520,y:320,button:'left',buttons:0,clickCount:1},page.sessionId);
      record.rotated=await page.evaluate(observation);assert.ok(record.rotated.pixels>0,'fascia stays visible after user rotation');
      await page.screenshot(out+'/'+c.key+'-rotated.png');
    }
    result.views.push(record);
    console.log(JSON.stringify({case:c.key,pixels:before.pixels,rotated:record.rotated?.pixels,hidden:record.hidden?.pixels}));
    await page.close();
  }
  result.passed=true;
} catch(error) {result.error=String(error);process.exitCode=1;console.error(error)}
finally {if(browser)await browser.close();await client.close();result.finishedAt=new Date().toISOString();await fs.writeFile(out+'/acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:result.checks,error:result.error}))}
