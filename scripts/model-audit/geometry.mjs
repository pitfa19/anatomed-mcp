import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const ROOT='/Users/fabijanpitlovic/Documents/anatomed-obsidian/assets';
const OUT='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/geometry';
await fs.mkdir(OUT,{recursive:true});
globalThis.self=globalThis;
const catalog=JSON.parse(await fs.readFile(ROOT+'/parts-catalog.json'));
const result={date:new Date().toISOString(),method:'Actual THREE.GLTFLoader + MeshoptDecoder, decoded position/index validation and scene-node matching. Not a rendering pass.',systems:[],parts:[],nodes:[]};
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const sanitize=THREE.PropertyBinding.sanitizeNodeName;
for(const system of catalog.systems){
 const b=await fs.readFile(ROOT+'/glb/'+system.id+'.glb');
 const raw=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 const gltf=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const root=gltf.scene;root.updateMatrixWorld(true);const nodes=[];const byName=new Map();
 const geoChecks=new Map();
 root.traverse(o=>{nodes.push(o);const arr=byName.get(o.name)||[];arr.push(o);byName.set(o.name,arr);
  if(!o.isMesh||geoChecks.has(o.geometry.uuid))return;
  const g=o.geometry,p=g.attributes.position;let badPositions=0,badIndices=0,badNormals=0,degenerateTriangles=0;
  for(let i=0;i<(p?.count||0);i++)for(let a=0;a<3;a++)if(!Number.isFinite(p.getComponent(i,a)))badPositions++;
  const index=g.index;const count=index?.count||p?.count||0;
  if(index)for(let i=0;i<index.count;i++){const x=index.getX(i);if(!Number.isInteger(x)||x<0||x>=p.count)badIndices++}
  const normal=g.attributes.normal;if(normal)for(let i=0;i<normal.count;i++)for(let a=0;a<3;a++)if(!Number.isFinite(normal.getComponent(i,a)))badNormals++;
  const a=new THREE.Vector3(),bb=new THREE.Vector3(),c=new THREE.Vector3();
  if(p&&!badPositions&&!badIndices)for(let i=0;i+2<count;i+=3){a.fromBufferAttribute(p,index?index.getX(i):i);bb.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);bb.sub(a);c.sub(a);if(bb.cross(c).lengthSq()===0)degenerateTriangles++}
  g.computeBoundingBox();geoChecks.set(g.uuid,{vertices:p?.count||0,triangles:Math.floor(count/3),badPositions,badIndices,badNormals,degenerateTriangles,bounds:g.boundingBox?.toArray?.()||[g.boundingBox?.min.toArray(),g.boundingBox?.max.toArray()]});
 });
 function describe(o){const geom=[];const box=new THREE.Box3();o.traverse(x=>{if(x.isMesh&&!x.name.includes('-lin')&&!x.name.includes('labels')){geom.push(geoChecks.get(x.geometry.uuid));const b=x.geometry.boundingBox?.clone();if(b)box.union(b.applyMatrix4(x.matrixWorld))}});return{renderableMeshes:geom.length,vertices:geom.reduce((n,g)=>n+g.vertices,0),triangles:geom.reduce((n,g)=>n+g.triangles,0),badPositions:geom.reduce((n,g)=>n+g.badPositions,0),badIndices:geom.reduce((n,g)=>n+g.badIndices,0),badNormals:geom.reduce((n,g)=>n+g.badNormals,0),degenerateTriangles:geom.reduce((n,g)=>n+g.degenerateTriangles,0),bounds:box.isEmpty()?null:[box.min.toArray(),box.max.toArray()],worldMatrixFinite:o.matrixWorld.elements.every(Number.isFinite)}}
 const nodeRows=nodes.map(o=>{const assoc=gltf.parser.associations.get(o);const source=assoc?.nodes!==undefined?raw.nodes[assoc.nodes]:null;return{system:system.id,name:o.name,sourceName:source?.name??null,rawIndex:assoc?.nodes??null,type:o.type,parent:o.parent?.name,ownMesh:!!o.isMesh,...describe(o)}});
 result.nodes.push(...nodeRows);
 for(const p of catalog.parts.filter(p=>p.system===system.id)){const matches=byName.get(sanitize(p.id))||[];const o=matches[0];const row={system:system.id,id:p.id,name:p.name_en,appSelectable:!p.id.endsWith('.g'),matchedNodes:matches.length,lookupName:sanitize(p.id),status:!o?'missing_node':'matched',...(o?describe(o):{})};if(o&&(!row.triangles||!row.bounds))row.status='no_geometry';if(o&&(row.badPositions||row.badIndices||!row.worldMatrixFinite))row.status='invalid_geometry';result.parts.push(row)}
 const partRows=result.parts.filter(p=>p.system===system.id);const missing=partRows.filter(p=>p.status!=='matched');
 const sum={system:system.id,catalog:partRows.length,appSelectable:partRows.filter(p=>p.appSelectable).length,loadedNodes:nodes.length,meshNodes:nodes.filter(n=>n.isMesh).length,uniqueGeometries:geoChecks.size,statuses:Object.fromEntries([...new Set(partRows.map(p=>p.status))].map(s=>[s,partRows.filter(p=>p.status===s).length])),selectableFailures:missing.filter(p=>p.appSelectable).length,invalidGeometries:[...geoChecks.values()].filter(g=>g.badPositions||g.badIndices||g.badNormals).length,zeroTriangleGeometries:[...geoChecks.values()].filter(g=>!g.triangles).length,renamedNodes:nodeRows.filter(n=>n.sourceName&&n.name!==sanitize(n.sourceName)).map(n=>({source:n.sourceName,actual:n.name})),failures:missing.map(p=>({id:p.id,status:p.status,appSelectable:p.appSelectable}))};result.systems.push(sum);console.log(JSON.stringify(sum));
 for(const g of geoChecks.keys()){}root.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}});
}
const neighbors=JSON.parse(await fs.readFile(ROOT+'/parts-neighbors.json'));result.neighborShape={type:Array.isArray(neighbors)?'array':typeof neighbors,keys:Object.keys(neighbors).slice(0,8)};
await fs.writeFile(OUT+'/decoded-geometry.json',JSON.stringify(result,null,2));
await fs.writeFile(OUT+'/summary.json',JSON.stringify(result.systems,null,2));
console.log('COMPLETE '+JSON.stringify({parts:result.parts.length,nodes:result.nodes.length,failures:result.parts.filter(p=>p.appSelectable&&p.status!=='matched').length}));
