import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const [baseline, output] = process.argv.slice(2);
if (!baseline || !output) throw Error('Usage: node test/renderer-evidence.mjs BASELINE OUTPUT');
async function records(directory) {
  const result = [];
  for (const name of await fs.readdir(directory)) {
    if (name.startsWith('catalog-') && name.endsWith('.json')) result.push(JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')));
  }
  return result;
}
const key = row => `${row.system}/${row.id}`;
const old = new Map((await records(path.join(baseline, 'render/mcp/full-v1'))).map(row => [key(row), row]));
const selected = JSON.parse(await fs.readFile(path.join(output, 'selected-baseline-cases.json'), 'utf8'));
assert.equal(selected.length, 524);
const summaries = [];
for (const repo of ['mcp', 'obsidian']) {
  for (const [orientation, width, height] of [['landscape', 800, 400], ['portrait', 360, 720]]) {
    const rows = await records(path.join(output, repo, orientation));
    assert.equal(rows.length, selected.length, `${repo}/${orientation} case count`);
    assert.deepEqual(new Set(rows.map(key)), new Set(selected.map(key)));
    for (const row of rows) {
      const label = `${repo}/${orientation}/${row.id}`;
      assert.equal(row.status, 'pass-structural', label);
      assert.deepEqual(row.errors, [], label);
      assert.deepEqual(row.geometry, old.get(key(row)).geometry, `${label} geometry unchanged`);
      assert.deepEqual(row.worldBounds, old.get(key(row)).worldBounds, `${label} transforms unchanged`);
      assert.ok(row.views[0].pixels.changed > 0, `${label} default visible`);
      assert.equal(row.views.length, 3, label);
      for (const view of row.views) {
        assert.equal(view.pixels.edge, 0, `${label}/${view.label} no edge contact`);
        assert.equal(view.pixels.width, width, label);
        assert.equal(view.pixels.height, height, label);
        assert.ok(view.camera.near >= 0 && view.camera.far > view.camera.near, label);
      }
      assert.equal(row.screenshots.length, 3, label);
      for (const image of row.screenshots) assert.ok((await fs.stat(path.join(output, repo, orientation, image))).size > 0);
    }
    const summary = { repo, orientation, cases: rows.length, views: rows.length * 3, baselineBlankFixed: selected.filter(r => r.blank).length, baselineFramingFixed: selected.filter(r => r.clipped).length, geometryAndTransformsUnchanged: true, runtimeErrors: 0, edgeContacts: 0 };
    summaries.push(summary);
    console.log(JSON.stringify(summary));
  }
}
await fs.writeFile(path.join(output, 'renderer-validation.json'), JSON.stringify(summaries, null, 2));
