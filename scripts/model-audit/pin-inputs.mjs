import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {unzipSync} from '/Users/fabijanpitlovic/Documents/anatomed-obsidian/node_modules/fflate/esm/index.mjs';
const OUT='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846';
const OBS='/Users/fabijanpitlovic/Documents/anatomed-obsidian';
const MCP='/Users/fabijanpitlovic/Documents/anatomed-mcp';
const hash=b=>createHash('sha256').update(b).digest('hex');
const getJSON=async u=>{const r=await fetch(u);if(!r.ok)throw Error(`${r.status} ${u}`);return r.json()};
await fs.mkdir(path.join(OUT,'inputs'),{recursive:true});
const manifest={date:new Date().toISOString(),repositories:{},files:[],errors:[]};
for(const [name,dir] of Object.entries({obsidian:OBS,mcp:MCP,upstream:OUT+'/upstream',web:OUT+'/anatomed-web'})) manifest.repositories[name]={path:dir,commit:execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim()};
const health=await getJSON('https://anatomed-mcp.vercel.app/healthz').catch(e=>({error:String(e)}));
manifest.liveHealth=health;
const base=health.assetBase||'https://uafyfwyyqzunabpuftue.supabase.co/storage/v1/object/public/models';
const cat=JSON.parse(await fs.readFile(OBS+'/assets/parts-catalog.json'));
for(const rel of [...cat.systems.map(s=>'glb/'+s.id+'.glb'),'parts-catalog.json','parts-neighbors.json']){
 const local=await fs.readFile(OBS+'/assets/'+rel);
 const rec={path:rel,localBytes:local.length,localSha256:hash(local),url:base+'/'+rel};
 try{const r=await fetch(rec.url);rec.httpStatus=r.status;if(!r.ok)throw Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());rec.hostedBytes=b.length;rec.hostedSha256=hash(b);rec.matchesLocal=rec.hostedSha256===rec.localSha256;await fs.mkdir(path.dirname(OUT+'/inputs/hosted/'+rel),{recursive:true});await fs.writeFile(OUT+'/inputs/hosted/'+rel,b);}catch(e){rec.error=String(e);manifest.errors.push(rec.error)}
 manifest.files.push(rec);console.log(JSON.stringify(rec));
}
const releaseUrl='https://github.com/pitfa19/anatomed-obsidian/releases/download/0.1.7/anatomed-assets-v1.zip';
try{const r=await fetch(releaseUrl);if(!r.ok)throw Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());await fs.writeFile(OUT+'/inputs/anatomed-assets-v1.zip',b);const z=unzipSync(b);manifest.release={url:releaseUrl,sha256:hash(b),bytes:b.length,entries:[]};for(const [name,data]of Object.entries(z)){const local=await fs.readFile(OBS+'/assets/'+name);manifest.release.entries.push({path:name,sha256:hash(data),bytes:data.length,matchesLocal:hash(local)===hash(data)})}}catch(e){manifest.errors.push('release '+String(e))}
manifest.catalogMatchesMcp=hash(await fs.readFile(MCP+'/assets/parts-catalog.json'))===hash(await fs.readFile(OBS+'/assets/parts-catalog.json'));
manifest.upstreamArchive={path:'Z-Anatomy.zip',sha256:hash(await fs.readFile(OUT+'/upstream/Z-Anatomy.zip')),history:JSON.parse(execFileSync('gh',['api','repos/Z-Anatomy/Models-of-human-anatomy/commits?path=Z-Anatomy.zip&per_page=100'],{encoding:'utf8'})).map(c=>({sha:c.sha,date:c.commit.committer.date,message:c.commit.message}))};
const converter=execFileSync('gh',['api','repos/pitfa19/Anatom3d/contents/tools/export_to_glb.py'],{encoding:'utf8'});const file=JSON.parse(converter);await fs.writeFile(OUT+'/inputs/export_to_glb.py',Buffer.from(file.content,'base64'));manifest.originalConverter={repo:'pitfa19/Anatom3d',blob:file.sha,path:file.path};
await fs.writeFile(OUT+'/inputs/manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({liveHealth:health,hostedMatches:manifest.files.filter(f=>f.matchesLocal).length,total:manifest.files.length,release:manifest.release,catalogMatches:manifest.catalogMatchesMcp,archive:manifest.upstreamArchive,errors:manifest.errors},null,2));
