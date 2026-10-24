import fs from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const out='/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/inputs/mcp-protocol.json';
const client=new Client({name:'anatomed-model-audit',version:'1.0.0'},{capabilities:{}});
const results={url:'https://anatomed-mcp.vercel.app/mcp',timestamp:new Date().toISOString(),calls:[]};
try{
await client.connect(new StreamableHTTPClientTransport(new URL(results.url)));
results.tools=await client.listTools();results.resources=await client.listResources();
const resource=await client.readResource({uri:'ui://anatomed/region-viewer'});
results.resource=resource.contents.map(c=>({uri:c.uri,mimeType:c.mimeType,htmlLength:c.text?.length,meta:c._meta}));
for(const query of ['heart','liver','kidney','sciatic nerve','cerebellum','abdominal aorta','femoral artery','organs','nervous system','vascular system']){
 const r=await client.callTool({name:'show_anatomy_region',arguments:{parts:[query],detail:'isolated'}});
 const d=r.structuredContent;const row={query,isError:r.isError||false,summary:r.content?.find(c=>c.type==='text')?.text,payload:d,meta:r._meta};results.calls.push(row);console.log(JSON.stringify({query,isError:row.isError,parts:d?.parts?.map(p=>p.id),unmatched:d?.unmatched}));
}
}finally{await client.close();await fs.writeFile(out,JSON.stringify(results,null,2))}
