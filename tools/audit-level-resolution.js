#!/usr/bin/env node
/**
 * audit-level-resolution.js — report per-map model resolution stats.
 * Usage: node tools/audit-level-resolution.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveModelPath, buildModelStemMap } from './model-viewer/model-resolve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const levelsDir = path.join(__dirname, 'model-viewer', 'levels');
const index = JSON.parse(fs.readFileSync(path.join(__dirname, 'model-viewer', 'index.json'), 'utf8'));
const modelByStem = buildModelStemMap(index.models);
const maps = JSON.parse(fs.readFileSync(path.join(levelsDir, 'levels-index.json'), 'utf8'));

const MAX_UNIQUE = 800;
const rows = [];

for (const m of maps) {
  const data = JSON.parse(fs.readFileSync(path.join(levelsDir, `${m.name}.json`), 'utf8'));
  const objs = data.Objects.filter((o) => o.IsActive !== false);
  let unr = 0;
  const byModel = new Map();
  for (const o of objs) {
    const p = resolveModelPath(o, modelByStem);
    if (p) (byModel.get(p) ?? byModel.set(p, []).get(p)).push(o);
    else unr++;
  }
  const unique = byModel.size;
  const sorted = [...byModel.entries()].sort((a, b) => b[1].length - a[1].length);
  const capped = sorted.slice(MAX_UNIQUE).reduce((n, [, list]) => n + list.length, 0);
  rows.push({
    name: m.name,
    total: objs.length,
    unr,
    unrPct: (100 * unr / objs.length).toFixed(1),
    unique,
    capped,
  });
}

rows.sort((a, b) => parseFloat(b.unrPct) - parseFloat(a.unrPct));
console.log('Map resolution audit (MAX_UNIQUE_MODELS=%d)\n', MAX_UNIQUE);
console.log('%-45s %8s %8s %6s %6s', 'map', 'total', 'unresolved', 'uniq', 'capped');
for (const r of rows.slice(0, 20)) {
  console.log('%-45s %8d %7s%% %6d %6d', r.name, r.total, r.unrPct, r.unique, r.capped);
}
const totalUnr = rows.reduce((s, r) => s + r.unr, 0);
const totalObj = rows.reduce((s, r) => s + r.total, 0);
console.log('\nGlobal: %d/%d unresolved (%.2f%%)', totalUnr, totalObj, 100 * totalUnr / totalObj);
