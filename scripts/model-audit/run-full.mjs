import fs from 'node:fs/promises';
import {launchBrowser} from './run-browser.mjs';
const BASE='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846';
const run=process.argv[2]||'full-v1';
const concurrency=Number(process.argv[3]||4);
const systems=['organs','nerves','vessels','skeleton','muscles','joints','insertions','regions'];
const jobs=systems.flatMap(system=>['obsidian','mcp'].map(repo=>({repo,system})));
const results=[];const active=new Map();let next=0;
await fs.mkdir(BASE+'/orchestration/'+run,{recursive:true});
const heartbeat=setInterval(async()=>{for(const [lane,p]of active){try{const status=await p.evaluate('window.audit?.status()',5000);console.log('JCODE_PROGRESS '+JSON.stringify({message:`lane ${lane}: ${status?.repo} ${status?.system} ${status?.kind} ${status?.id}`,current:status?.completed,total:status?.total,unit:'objects'}))}catch(e){console.log('PROGRESS_NOTE '+String(e))}}},60000);
async function worker(lane){
 const browser=await launchBrowser(BASE+'/orchestration/'+run+'/lane-'+lane);
 browser.listeners.add(m=>{if(m.method==='Runtime.exceptionThrown')console.log('PAGE_EXCEPTION '+JSON.stringify({lane,detail:m.params.exceptionDetails}));});
 try{while(next<jobs.length){const job=jobs[next++];const started=Date.now();console.log('START '+JSON.stringify({lane,...job}));let page;
  try{page=await browser.page(`http://127.0.0.1:8879/${job.repo}/`);active.set(lane,page);await page.evaluate(`(async()=>{const start=Date.now();while(!window.audit){if(Date.now()-start>30000)throw Error('audit API missing');await new Promise(r=>setTimeout(r,50))}return window.audit.manifest().repo})()`);const summary=await page.evaluate(`window.audit.run(${JSON.stringify({runId:run,systems:[job.system],viewpoints:3,settleFrames:12})})`,14400000);const result={...job,lane,durationSeconds:(Date.now()-started)/1000,complete:summary.systems?.[0]?.complete,counts:summary.systems?.[0]?.counts,records:summary.systems?.[0]?.records?.length};results.push(result);console.log('JCODE_CHECKPOINT '+JSON.stringify({message:`Completed ${job.repo} ${job.system}`,result}));}
  catch(e){const failure={...job,lane,error:String(e)};results.push(failure);console.log('JOB_ERROR '+JSON.stringify(failure));}
  finally{active.delete(lane);if(page)await page.close().catch(()=>{});await fs.writeFile(BASE+'/orchestration/'+run+'/results.json',JSON.stringify(results,null,2))}
 }}finally{await browser.close()}
}
try{await Promise.all(Array.from({length:concurrency},(_,i)=>worker(i)));console.log('ALL_JOBS_COMPLETE '+JSON.stringify(results));if(results.some(r=>!r.complete))process.exitCode=2;}finally{clearInterval(heartbeat)}
