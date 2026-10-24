import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {launchBrowser} from './run-browser.mjs';
const root='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846';
const report=JSON.parse(await fs.readFile(root+'/audit-results.json'));
assert.equal(report.sourceRows.length,7184);
assert.equal(new Set(report.sourceRows.map(r=>r.id)).size,7184);
for(const host of ['obsidian','mcp']){
 assert.equal(report.coverage[host].coverageComplete,true);
 assert.equal(report.records.filter(r=>r.host===host&&r.kind==='catalog').length,3540);
 assert.equal(report.summaries.filter(r=>r.host===host).reduce((s,r)=>s+r.selectable,0),3534);
 assert.equal(report.records.filter(r=>r.host===host&&r.kind==='synthetic-export').length,report.coverage[host].counts.synthetic.expected);
}
for(const record of report.records){
 assert.equal(record.renderAttempted,true,record.id);
 assert.equal(record.screenshots.length,3,record.id);
 for(const image of record.screenshots){const signature=await fs.open(root+'/'+image,'r');try{const b=Buffer.alloc(8);await signature.read(b,0,8,0);assert.equal(b.toString('hex'),'89504e470d0a1a0a',image)}finally{await signature.close()}}
}
const nodeAccounting=[];
for(const host of ['obsidian','mcp'])for(const system of report.summaries.filter(r=>r.host===host).map(r=>r.system)){
 const inventory=JSON.parse(await fs.readFile(root+'/render/'+host+'/'+report.run+'/inventory-'+system+'.json'));
 const records=report.records.filter(r=>r.host===host&&r.system===system);
 const rows=inventory.entries.map(entry=>{
  const matches=records.filter(r=>r.kind==='catalog'?entry.catalogMatches.includes(r.sanitizedId):r.index===entry.index&&entry.loaderNames.includes(r.id));
  assert.ok(matches.length,'Unaccounted exported node '+host+' '+system+' '+entry.index);
  return {index:entry.index,rawName:entry.rawName,activeParserAssociation:entry.activeScene,records:matches.map(r=>r.artifact),renders:matches.some(r=>r.nodeMatches===1&&r.triangles>0&&r.pixels[0]>0)};
 });
 nodeAccounting.push({host,system,total:rows.length,associationMissing:rows.filter(r=>!r.activeParserAssociation).length,associationMissingButRenders:rows.filter(r=>!r.activeParserAssociation&&r.renders).length,rows});
}
await fs.writeFile(root+'/exported-node-accounting.json',JSON.stringify({note:'Parser node associations may be lost for cloned objects. Missing association is not itself proof of an inactive model. Actual exact-node render evidence is authoritative.',systems:nodeAccounting},null,2));
const out=root+'/report-validation';await fs.mkdir(out,{recursive:true});
const browser=await launchBrowser(out);
try{
 const page=await browser.page('file://'+root+'/REPORT.html');
 const initial=await page.evaluate(`({count:document.querySelector('#count').textContent,rows:document.querySelectorAll('#rows tr').length})`);
 assert.match(initial.count,/7080 matching records/);assert.equal(initial.rows,200);
 const filtered=await page.evaluate(`(()=>{const q=document.querySelector('#search');q.value='Cerebellum';q.dispatchEvent(new Event('input'));return {count:document.querySelector('#count').textContent,text:document.querySelector('#rows').innerText,links:[...document.querySelectorAll('#rows a')].map(a=>a.getAttribute('href'))}})()`);
 assert.match(filtered.count,/4 matching records/);assert.match(filtered.text,/blank-default-view/);
 for(const link of filtered.links)await fs.access(root+'/'+link);
 const source=await page.evaluate(`(()=>{document.querySelector('#search').value='';const d=document.querySelector('#dataset');d.value='source';d.dispatchEvent(new Event('input'));return document.querySelector('#count').textContent})()`);
 assert.match(source,/7184 matching records/);
 await page.evaluate(`document.querySelector('#dataset').value='catalog';document.querySelector('#dataset').dispatchEvent(new Event('input'));window.scrollTo(0,0)`);
 await page.screenshot(out+'/report-overview.png');
 const evidence={passed:true,sourceObjects:report.sourceRows.length,exportedNodes:nodeAccounting.map(({rows,...r})=>r),renderRecords:report.records.length,screenshots:report.records.reduce((s,r)=>s+r.screenshots.length,0),initial,filtered,source};
 await fs.writeFile(out+'/checks.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 await page.close();
}finally{await browser.close()}
