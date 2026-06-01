// Headless protocol smoke test: connect, list tools, call the region tool,
// read the UI resource. Verifies the MCP wiring + _meta/CSP placement.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.env.MCP_URL ?? 'http://localhost:3000/mcp');

const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} });
await client.connect(new StreamableHTTPClientTransport(url));

const tools = await client.listTools();
console.log('TOOLS:', JSON.stringify(tools.tools.map((t) => ({ name: t.name, _meta: (t as any)._meta })), null, 2));

const region = process.argv[2] ?? 'cervical spine';
const res: any = await client.callTool({
  name: 'show_anatomy_region',
  arguments: { parts: [region] },
});
console.log('\nCALL result _meta:', JSON.stringify(res._meta));
console.log('summary:', res.content?.[0]?.text);
console.log('structuredContent.title:', res.structuredContent?.title);
console.log('structuredContent.parts:', res.structuredContent?.parts?.length);
console.log('structuredContent.systems:', JSON.stringify(res.structuredContent?.systems));
console.log('first parts:', JSON.stringify(res.structuredContent?.parts?.slice(0, 4)));
console.log('unmatched:', JSON.stringify(res.structuredContent?.unmatched));

const resources = await client.listResources();
console.log('\nRESOURCES:', JSON.stringify(resources.resources.map((r) => ({ uri: r.uri, mimeType: r.mimeType, _meta: (r as any)._meta })), null, 2));

const rd: any = await client.readResource({ uri: 'ui://anatomed/region-viewer' });
const c = rd.contents?.[0];
console.log('\nREAD resource mime:', c?.mimeType, 'htmlLen:', c?.text?.length, '_meta:', JSON.stringify(c?._meta));

await client.close();
console.log('\nOK');
