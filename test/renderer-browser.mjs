import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launchBrowser } from '../scripts/model-audit/run-browser.mjs';

// Read-only use of the baseline audit, with all new evidence in an explicit directory.
const [baseline, output, origin = 'http://127.0.0.1:8771'] = process.argv.slice(2);
if (!baseline || !output || path.resolve(baseline) === path.resolve(output)) throw Error('Supply distinct baseline and output directories');
const source = path.join(baseline, 'render/mcp/full-v1');
const selected = [];
for (const name of await fs.readdir(source)) {
  if (!name.startsWith('catalog-') || !name.endsWith('.json')) continue;
  const row = JSON.parse(await fs.readFile(path.join(source, name), 'utf8'));
  if (!row.geometry?.triangles || !row.views?.length) continue;
  const blank = row.views[0].pixels.changed === 0 && row.views.some(v => v.pixels.changed > 0);
  const clipped = row.views.some(v => v.pixels.edge > 0);
  if (blank || clipped) selected.push({ id: row.id, system: row.system, blank, clipped });
}
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'selected-baseline-cases.json'), JSON.stringify(selected, null, 2));
console.log('SELECTED', selected.length, 'blank', selected.filter(r => r.blank).length, 'clipped', selected.filter(r => r.clipped).length);
assert.equal(selected.filter(r => r.blank).length, 15, 'baseline thin-surface population');
const browser = await launchBrowser(output);
const results = [];
try {
  for (const repo of ['mcp', 'obsidian']) {
    for (const [label, width, height] of [['landscape', 800, 400], ['portrait', 360, 720]]) {
      const page = await browser.page(`${origin}/${repo}/`);
      await page.evaluate(`new Promise((resolve,reject)=>{const start=Date.now();const t=setInterval(()=>{if(window.audit){clearInterval(t);resolve(true)}else if(Date.now()-start>60000){clearInterval(t);reject(Error('audit API timeout'))}},50)})`);
      await page.evaluate(`(()=>{const style=document.createElement('style');style.textContent='#root,.am-viewport,.am-stage{width:${width}px!important;height:${height}px!important}';document.head.append(style)})()`);
      const result = await page.evaluate(`window.audit.run(${JSON.stringify({ runId: label, systems: [...new Set(selected.map(r => r.system))], ids: selected.map(r => r.id), includeSynthetic: false, viewpoints: 3 })})`, 3600000);
      results.push({ repo, label, result });
      await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify(results, null, 2));
      const records = result.systems.flatMap(s => s.records);
      assert.equal(records.length, selected.length, 'every selected baseline case attempted');
      assert.deepEqual(records.filter(r => r.status !== 'pass-structural'), [], `${repo} ${label} structural render regressions`);
      console.log('JCODE_PROGRESS '+JSON.stringify({current:results.length,total:4,message:`${repo} ${label} completed`}));
      await page.close();
    }
  }
} finally { await browser.close(); }
