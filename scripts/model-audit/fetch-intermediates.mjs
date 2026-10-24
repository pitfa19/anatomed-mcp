import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const out='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/inputs/fbx';await fs.mkdir(out,{recursive:true});
const listing=JSON.parse(execFileSync('gh',['api','repos/pitfa19/Anatom3d/contents/Assets/Models/1.0%20Models'],{encoding:'utf8'}));
const manifest=[];
for(const file of listing.filter(f=>f.name.endsWith('.fbx'))){
 const response=await fetch(file.download_url);if(!response.ok)throw Error(`${response.status} downloading ${file.name}`);const body=Buffer.from(await response.arrayBuffer());
 await fs.writeFile(out+'/'+file.name,body);const row={name:file.name,blob:file.sha,expectedBytes:file.size,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};if(row.bytes!==row.expectedBytes)throw Error('Wrong byte length '+file.name);manifest.push(row);console.log(JSON.stringify(row));
}
await fs.writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2));
