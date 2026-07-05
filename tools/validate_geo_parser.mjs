#!/usr/bin/env node
/**
 * validate_geo_parser.mjs — validate the viewer's JS .geo parser.
 *
 * Modes:
 *   node tools/validate_geo_parser.mjs <geo-dir> --stats <python-stats.json>
 *       Parse every .geo under <geo-dir> and diff mesh/vertex/triangle/material
 *       counts against `python tools/geo_to_obj.py --stats-json` output.
 *
 *   node tools/validate_geo_parser.mjs <geo-dir> [--sample N]
 *       Broad smoke test: parse (a sample of) all .geo files, report the success
 *       rate and bucket failures by error message.
 *
 * Requires Node >= 18.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseGeo } from './model-viewer/geo-parser.js';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.geo\d*$/i.test(name)) yield p;
  }
}

function parseArgs(argv) {
  const args = { dir: null, stats: null, sample: 0 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--stats') args.stats = argv[++i];
    else if (argv[i] === '--sample') args.sample = parseInt(argv[++i], 10);
    else args.dir = argv[i];
  }
  if (!args.dir) {
    console.error('usage: node tools/validate_geo_parser.mjs <geo-dir> [--stats stats.json] [--sample N]');
    process.exit(2);
  }
  return args;
}

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const args = parseArgs(process.argv);
let files = [...walk(args.dir)];
if (args.sample > 0 && files.length > args.sample) {
  // Deterministic sample: every Nth file.
  const step = files.length / args.sample;
  files = Array.from({ length: args.sample }, (_, i) => files[Math.floor(i * step)]);
}
console.log(`${files.length} .geo file(s) to parse from ${args.dir}`);

const failures = new Map(); // message bucket -> [files]
let okCount = 0;
let warnCount = 0;
const parsedByRel = new Map();

for (const file of files) {
  const rel = relative(args.dir, file).replaceAll('\\', '/');
  try {
    const result = parseGeo(toArrayBuffer(readFileSync(file)));
    if (result.sections.length === 0) throw new Error('no renderable sections');
    okCount++;
    warnCount += result.warnings.length;
    parsedByRel.set(rel, result);
  } catch (e) {
    const bucket = String(e.message).replace(/@\d+/g, '@N').replace(/\d+/g, 'N');
    if (!failures.has(bucket)) failures.set(bucket, []);
    failures.get(bucket).push(rel);
  }
}

const rate = ((okCount / files.length) * 100).toFixed(2);
console.log(`parsed OK: ${okCount}/${files.length} (${rate}%), parser warnings on OK files: ${warnCount}`);
for (const [bucket, list] of [...failures.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  FAIL x${list.length}: ${bucket}  e.g. ${list[0]}`);
}

// --- diff against python geo_to_obj.py --stats-json ---------------------------------
if (args.stats) {
  const pyStats = JSON.parse(readFileSync(args.stats, 'utf-8'));
  let match = 0;
  let mismatch = 0;
  const details = [];
  for (const [rel, py] of Object.entries(pyStats)) {
    const js = parsedByRel.get(rel);
    if (!js) { details.push(`${rel}: parsed by python but not by JS`); mismatch++; continue; }
    const jsMeshes = js.sections.length;
    const jsVerts = js.sections.map((s) => s.vertexCount);
    const jsTris = js.sections.map((s) => s.triangleCount);
    const jsMats = js.sections.map((s) => ({
      effect: s.effect || '',
      diffuse: typeof s.params.DiffuseTexture === 'string' ? s.params.DiffuseTexture : null,
    }));
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const pyMats = (py.materials ?? []).map((m) => ({ effect: m.effect, diffuse: m.diffuse }));
    if (jsMeshes === py.meshes && eq(jsVerts, py.verts) && eq(jsTris, py.tris) && eq(jsMats, pyMats)) {
      match++;
    } else {
      mismatch++;
      details.push(`${rel}: meshes ${jsMeshes} vs ${py.meshes}, verts ${JSON.stringify(jsVerts)} vs ${JSON.stringify(py.verts)}`);
    }
  }
  console.log(`\nstats diff vs ${args.stats}: ${match} match, ${mismatch} mismatch`);
  for (const d of details.slice(0, 20)) console.log(`  ${d}`);
  if (mismatch) process.exitCode = 1;
}
