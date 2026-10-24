import fs from 'node:fs/promises';
const ROOT='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846';
const inventory=JSON.parse(await fs.readFile(ROOT+'/source/inventory.json'));
const mapping=JSON.parse(await fs.readFile(ROOT+'/source/mapping.json'));
const fbx=JSON.parse(await fs.readFile(ROOT+'/inputs/fbx/inventory.json'));
const byName=new Map(mapping.objects.map(o=>[o.source_name,o]));
const primary={'1':'skeleton','2':'insertions','3':'joints','4':'muscles','5':'vessels','6':'lymphoid','7':'nerves','8':'organs','9':'regions'};
const tokens=name=>new Set(name.toLowerCase().replace(/\.(?:o|i)?[lr]$/,'').replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t&&!['the','of','on','and','part','muscle','insertion','origin'].includes(t)));
const side=name=>name.match(/\.(?:o|i)?([lr])$/)?.[1]??null;
function overlap(a,b){a=tokens(a);b=tokens(b);const n=[...a].filter(x=>b.has(x)).length;return n/Math.max(a.size,b.size,1)}
const rows=[];
for(const source of inventory.objects){
 if(source.converter_helper_exclusion.excluded||!(source.evaluated_enabled?.faces>0))continue;
 const m=byName.get(source.name);const system=source.collections.map(c=>primary[c.match(/^(\d):/)?.[1]]).find(Boolean)??'other';
 if(['exact_named_mesh','exact_named_container_with_mesh_descendants'].includes(m.glb_geometry_evidence)){rows.push({source:source.name,system,status:'exact-named-export-geometry',exports:m.glb.exact.map(g=>({system:g.system,name:g.name}))});continue}
 const sb=source.evaluated_enabled.bounds.world;const maxSize=Math.max(...sb.max.map((v,i)=>v-sb.min[i]));
 const candidates=[];
 for(const file of fbx.files.filter(f=>f.system===system||(system==='lymphoid'&&f.system==='organs'))){
 for(const obj of file.objects.filter(o=>o.originalCatalogRule&&o.polygons>0&&o.bounds)){
  const diff=Math.max(...[0,1,2].flatMap(i=>[Math.abs(sb.min[i]-obj.bounds[0][i]),Math.abs(sb.max[i]-obj.bounds[1][i])]));
  const allowed=0.0003+maxSize*0.03;
  if(diff>allowed)continue;
  const similarity=overlap(source.name,obj.name);const sameSide=!side(source.name)||!side(obj.name)||side(source.name)===side(obj.name);
  candidates.push({id:obj.name,system:file.system,bboxMaxErrorMeters:diff,allowedErrorMeters:allowed,nameTokenOverlap:similarity,sameSide});
 }}
 candidates.sort((a,b)=>b.nameTokenOverlap-a.nameTokenOverlap||a.bboxMaxErrorMeters-b.bboxMaxErrorMeters);
 const strong=candidates.filter(c=>c.nameTokenOverlap>=0.6&&c.sameSide);
 rows.push({source:source.name,system,status:strong.length===1?'single-name-and-bounds-candidate':strong.length>1?'ambiguous-name-and-bounds-candidates':candidates.length?'bounds-only-candidates':'no-close-intermediate-candidate',sourceMaxExtentMeters:maxSize,candidates:candidates.slice(0,6),note:'Candidates are not proof of anatomical identity or surface equivalence. No automatic alias or exclusion is applied.'});
}
const summary={method:'For nonhelper positive-face source anatomy, preserve exact exported geometry matches. Otherwise compare same-system intermediate world bounds with tolerance 0.3 mm + 3% of maximum source extent, plus name-token overlap and laterality. Candidate-only evidence, not automatic identity proof.',total:rows.length,statuses:Object.fromEntries([...new Set(rows.map(r=>r.status))].map(s=>[s,rows.filter(r=>r.status===s).length])),systems:Object.fromEntries([...new Set(rows.map(r=>r.system))].map(s=>[s,Object.fromEntries([...new Set(rows.map(r=>r.status))].map(t=>[t,rows.filter(r=>r.system===s&&r.status===t).length]))]))};
await fs.writeFile(ROOT+'/geometry/source-spatial-reconciliation.json',JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary,null,2));
