/**
 * model-resolve.js — resolve map placement names to .geo paths via index.json stems.
 */

const SUFFIX_ALIASES = [
  ['-dead', '_dead'],
  ['-alive', '_alive'],
  ['-stump', '_stump'],
  ['-snow', '_snow'],
  ['-dirty', '_dirty'],
  ['-nopyhsics', '_nophysics'],
  ['-nophysics', '_nophysics'],
];

/**
 * Generate name candidates from a clonebase field value.
 * @param {string} v
 * @returns {string[]}
 */
export function nameCandidates(v) {
  if (!v) return [];
  const s = v.trim().toLowerCase();
  const out = new Set([s, `obj_${s}`]);
  const hy = s.replace(/-/g, '_');
  const dash = s.replace(/_/g, '-');
  out.add(hy);
  out.add(`obj_${hy}`);
  out.add(dash);
  out.add(`obj_${dash}`);
  for (const [from, to] of SUFFIX_ALIASES) {
    if (s.endsWith(from)) {
      const base = s.slice(0, -from.length);
      out.add(base + to);
      out.add(`obj_${base}${to}`);
      out.add(base.replace(/-/g, '_') + to);
    }
    if (s.endsWith(to)) {
      const base = s.slice(0, -to.length);
      out.add(base + from);
      out.add(`obj_${base}${from}`);
    }
  }
  return [...out];
}

/**
 * @param {{Unique?:string, Physics?:string, Short?:string}} obj
 * @param {Map<string,string>} modelByStem lowercase stem -> path
 * @returns {string|null} repo-relative .geo path
 */
export function resolveModelPath(obj, modelByStem) {
  const tried = [];
  for (const field of [obj.Unique, obj.Physics, obj.Short]) {
    for (const n of nameCandidates(field)) {
      if (tried.includes(n)) continue;
      tried.push(n);
      const p = modelByStem.get(n);
      if (p) return p;
    }
  }
  return fuzzyResolve(obj, modelByStem, tried);
}

/**
 * Last-resort: tree/snag assets where clonebase hyphenation differs from shipped geo stems.
 */
function fuzzyResolve(obj, modelByStem, tried) {
  const raw = (obj.Unique || obj.Physics || obj.Short || '').trim().toLowerCase();
  if (!raw || !/snag_tree|_tree_/.test(raw)) return null;

  const norm = raw.replace(/^obj_/, '').replace(/-/g, '_');
  const parts = norm.split('_');
  const family = parts.find((p) => p.includes('tree')) ? parts.slice(0, parts.indexOf('tree') + 2).join('_') : parts.slice(0, 4).join('_');
  const variant = parts.slice(-2).join('_');

  const matches = [];
  for (const [stem, path] of modelByStem) {
    if (tried.includes(stem)) continue;
    if (!stem.includes('snag_tree') && !stem.includes('_tree_')) continue;
    if (!stem.startsWith(family.slice(0, Math.min(family.length, 20)))) continue;
    const stemVar = stem.replace(/^obj_/, '').split('_').slice(-2).join('_');
    if (stemVar === variant || stem.includes(variant.replace(/_/g, ''))) {
      matches.push(path);
    }
  }
  if (matches.length === 1) return matches[0];
  return null;
}

/**
 * Build stem -> path map from index.json models array.
 * @param {{name:string, path:string}[]} models
 */
export function buildModelStemMap(models) {
  const map = new Map();
  for (const m of models) {
    map.set(m.name.toLowerCase().replace(/\.geo$/, ''), m.path);
  }
  return map;
}
