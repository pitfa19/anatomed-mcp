import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as obs from '/Users/fabijanpitlovic/Documents/anatomed-obsidian/widget/lib/three-helpers.ts';
import * as mcp from '../../widget/lib/three-helpers.ts';
const root='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846';
const cat=JSON.parse(await fs.readFile('/Users/fabijanpitlovic/Documents/anatomed-obsidian/assets/parts-catalog.json'));
const source=JSON.parse(await fs.readFile(root+'/source/inventory.json'));
const sourceByName=new Map(source.objects.map(o=>[o.name,o]));
const rows=[];globalThis.self=globalThis;
function bounds(o){const b=new THREE.Box3().setFromObject(o);return b.isEmpty()?null:{min:b.min.toArray(),max:b.max.toArray(),size:b.getSize(new THREE.Vector3()).toArray(),center:b.getCenter(new THREE.Vector3()).toArray()}}
for(const sys of cat.systems){const buf=await fs.readFile('/Users/fabijanpitlovic/Documents/anatomed-obsidian/assets/glb/'+sys.id+'.glb');const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length),'');
 for(const [host,helpers]of Object.entries({obsidian:obs,mcp})){const clone=gltf.scene.clone(true);clone.updateMatrixWorld(true);const before=new Map();clone.traverse(o=>{if(o.isMesh)before.set(o.uuid,{scale:o.scale.toArray(),bounds:bounds(o),name:o.name})});helpers.applyTint(clone,sys.tint,sys.id);clone.updateMatrixWorld(true);
 for(const p of cat.parts.filter(p=>p.system===sys.id)){const node=helpers.findPartByName(clone,p.id);if(!node)continue;const changes=[];node.traverse(o=>{if(!o.isMesh)return;const b=before.get(o.uuid),scale=o.scale.toArray();if(scale.some((x,i)=>x!==b.scale[i]))changes.push({name:o.name,before:b,after:{scale,bounds:bounds(o)}})});if(changes.length)rows.push({host,system:sys.id,id:p.id,changes})}
 }
}
await fs.writeFile(root+'/geometry/viewer-transform-changes.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify({rows:rows.length,counts:Object.fromEntries(cat.systems.map(s=>[s.id,rows.filter(r=>r.system===s.id&&r.host==='obsidian').length])),examples:rows.filter(r=>r.host==='obsidian').slice(0,12)},null,2));
