/**
 * geo-parser.js — Auto Assault .geo parser (pure JS, no three.js imports; runs in
 * browsers and Node). Implements docs/geo-format.md:
 *
 *   CHNK container -> GBOD root -> GPCE sections, each with an EFCT material
 *   (effect .fx name + typed PARM parameters), an XDNI triangle-list index buffer,
 *   a TREV vertex buffer with an embedded LCED D3D9-style vertex declaration,
 *   an XOBB bounding box, and an ADSU user-data chunk carrying "LODLevel".
 *
 * parseGeo(arrayBuffer) -> {
 *   sections: [{
 *     name, lod, effect, params,                    // material record
 *     positions: Float32Array,                      // 3 per vertex
 *     normals: Float32Array|null, uvs: Float32Array|null,
 *     indices: Uint16Array|Uint32Array,             // triangle list
 *     stride, vertexCount, triangleCount,
 *     bbox: {min:[x,y,z], max:[x,y,z], center:[x,y,z], radius}|null,
 *   }],
 *   warnings: [string],
 * }
 *
 * UVs are raw D3D-convention values (v=0 at texture top). They line up with
 * DDS textures uploaded without flipY (compressed DDS cannot be flipped).
 */

const TAGS = new Set([
  'DOBG', 'ECPG', 'TCFE', 'MRAP', 'RTSI', 'TREV', 'XDNI',
  'LCED', 'XOBB', 'NOBP', 'TADB', 'ADSU',
]);

// D3DDECLTYPE -> byte size.
const DECL_TYPE_SIZE = [4, 8, 12, 16, 4, 4, 4, 8, 4, 4, 8, 4, 8, 4, 4, 4, 8];
const USAGE_POSITION = 0;
const USAGE_NORMAL = 3;
const USAGE_TEXCOORD = 5;

function tagAt(bytes, off) {
  return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

function readCString(bytes, off, end) {
  let z = off;
  while (z < end && bytes[z] !== 0) z++;
  let s = '';
  for (let i = off; i < z; i++) s += String.fromCharCode(bytes[i]);
  return { value: s, next: z + 1 };
}

/**
 * Bounded scan for validated child chunks inside a parent body [start, end).
 * Chunks have raw fields between them; validation: known tag + body fits in the
 * parent + version < 100 + reserved dword == 0. Found children are skipped whole.
 */
function scanChildChunks(dv, bytes, start, end) {
  const out = [];
  let i = start;
  while (i <= end - 16) {
    const tag = tagAt(bytes, i);
    if (TAGS.has(tag)) {
      const size = dv.getUint32(i + 4, true);
      const ver = dv.getUint32(i + 8, true);
      const resv = dv.getUint32(i + 12, true);
      if (size <= end - (i + 16) && ver < 100 && resv === 0) {
        out.push({ tag, off: i, size, ver });
        i += 16 + size;
        continue;
      }
    }
    i++;
  }
  return out;
}

function parseDecl(dv, off) {
  const size = dv.getUint32(off + 4, true);
  const nel = dv.getUint32(off + 16, true);
  if (4 + nel * 4 !== size) throw new Error(`LCED size mismatch (${size} vs ${4 + nel * 4})`);
  const elements = [];
  for (let i = 0; i < nel; i++) {
    const p = off + 20 + 4 * i;
    elements.push({
      type: dv.getUint8(p),
      stream: dv.getUint8(p + 1),
      usage: dv.getUint8(p + 2),
      usageIndex: dv.getUint8(p + 3),
    });
  }
  return { elements, end: off + 16 + size };
}

function declLayout(elements) {
  const map = new Map();
  let cur = 0;
  for (const el of elements) {
    map.set(el.usage * 256 + el.usageIndex, { offset: cur, type: el.type });
    cur += DECL_TYPE_SIZE[el.type] ?? 0;
  }
  return { map, stride: cur };
}

function halfToFloat(h) {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

/** Read `want` float components of a DECL-typed attribute into out[outOff..]. */
function readVec(dv, off, type, want, out, outOff) {
  if (type <= 3) { // FLOAT1..4
    const n = Math.min(type + 1, want);
    for (let i = 0; i < n; i++) out[outOff + i] = dv.getFloat32(off + 4 * i, true);
    return;
  }
  if (type === 15 || type === 16) { // FLOAT16_2 / FLOAT16_4
    const n = Math.min(type === 15 ? 2 : 4, want);
    for (let i = 0; i < n; i++) out[outOff + i] = halfToFloat(dv.getUint16(off + 2 * i, true));
  }
  // Other types (colors, blend indices) are not needed for pos/normal/uv.
}

function parseTrev(dv, bytes, off, ver, warnings) {
  const size = dv.getUint32(off + 4, true);
  const body = off + 16;
  const end = body + size;

  let elements, count, start, headerStride = 0;
  if (ver >= 3) {
    headerStride = dv.getUint16(body + 4, true);
    if (tagAt(bytes, body + 8) !== 'LCED') throw new Error('TREV v3 missing LCED at body+8');
    const d = parseDecl(dv, body + 8);
    elements = d.elements;
    count = dv.getUint32(d.end, true);
    start = d.end + 4;
  } else if (ver === 2) {
    if (tagAt(bytes, body) !== 'LCED') throw new Error('TREV v2 missing LCED at body+0');
    const d = parseDecl(dv, body);
    elements = d.elements;
    count = dv.getUint32(d.end, true);
    start = d.end + 4;
  } else {
    throw new Error(`unsupported TREV version ${ver}`);
  }

  const { map, stride } = declLayout(elements);
  if (headerStride && headerStride !== stride) {
    throw new Error(`DECL stride ${stride} != header stride ${headerStride}`);
  }
  if (start + count * stride > end) throw new Error('TREV vertex data exceeds chunk body');

  const pos = map.get(USAGE_POSITION * 256);
  const nrm = map.get(USAGE_NORMAL * 256);
  const uv = map.get(USAGE_TEXCOORD * 256);
  if (!pos) warnings.push('TREV has no POSITION attribute');

  const positions = new Float32Array(count * 3);
  const normals = nrm ? new Float32Array(count * 3) : null;
  const uvs = uv ? new Float32Array(count * 2) : null;
  for (let i = 0; i < count; i++) {
    const rec = start + i * stride;
    if (pos) readVec(dv, rec + pos.offset, pos.type, 3, positions, i * 3);
    if (nrm) readVec(dv, rec + nrm.offset, nrm.type, 3, normals, i * 3);
    if (uv) readVec(dv, rec + uv.offset, uv.type, 2, uvs, i * 2);
  }
  return { positions, normals, uvs, stride, count };
}

function parseXdni(dv, off, ver) {
  const size = dv.getUint32(off + 4, true);
  const body = off + 16;
  const end = body + size;

  let indexSize, count, start;
  if (ver >= 2) {
    indexSize = dv.getUint16(body + 4, true);
    count = dv.getUint32(body + 8, true);
    start = body + 12;
  } else if (ver === 1) {
    indexSize = 2;
    count = dv.getUint32(body, true);
    start = body + 4;
  } else {
    throw new Error(`unsupported XDNI version ${ver}`);
  }
  if (indexSize !== 2 && indexSize !== 4) throw new Error(`unsupported XDNI index size ${indexSize}`);

  const usable = Math.min(count, Math.floor((end - start) / indexSize));
  const triCount = Math.floor(usable / 3);
  const indices = indexSize === 2 ? new Uint16Array(triCount * 3) : new Uint32Array(triCount * 3);
  for (let i = 0; i < triCount * 3; i++) {
    indices[i] = indexSize === 2 ? dv.getUint16(start + 2 * i, true) : dv.getUint32(start + 4 * i, true);
  }
  return indices;
}

function parseParm(dv, bytes, off, warnings) {
  const size = dv.getUint32(off + 4, true);
  const body = off + 16;
  const end = body + size;
  const { value: name, next } = readCString(bytes, body, end);
  const type = dv.getUint32(next, true);
  let p = next + 4;
  let value = null;
  switch (type) {
    case 1: value = dv.getUint32(p, true) !== 0; break;
    case 2: value = dv.getUint32(p, true); break;
    case 3: {
      const cnt = dv.getUint32(p, true);
      value = new Array(cnt);
      for (let i = 0; i < cnt; i++) value[i] = dv.getFloat32(p + 4 + 4 * i, true);
      break;
    }
    case 4: value = readCString(bytes, p, end).value; break;
    case 5: {
      if (tagAt(bytes, p) !== 'RTSI') { warnings.push(`PARM '${name}' type 5 without ISTR`); return null; }
      const ssize = dv.getUint32(p + 4, true);
      value = readCString(bytes, p + 16, p + 16 + ssize).value;
      break;
    }
    default:
      warnings.push(`PARM '${name}' unknown value type ${type}`);
      return null;
  }
  return { name, value };
}

function parseEfct(dv, bytes, off, size, warnings) {
  const material = { effect: '', params: {} };
  for (const c of scanChildChunks(dv, bytes, off + 16, off + 16 + size)) {
    if (c.tag === 'RTSI' && !material.effect) {
      material.effect = readCString(bytes, c.off + 16, c.off + 16 + c.size).value;
    } else if (c.tag === 'MRAP') {
      try {
        const parm = parseParm(dv, bytes, c.off, warnings);
        if (parm) material.params[parm.name] = parm.value;
      } catch (e) {
        warnings.push(`PARM parse error: ${e.message}`);
      }
    }
  }
  return material;
}

function parseUsda(dv, bytes, off, size) {
  const body = off + 16;
  const end = body + size;
  const cnt = dv.getUint32(body, true);
  const kv = {};
  let p = body + 4;
  for (let i = 0; i < cnt && p < end; i++) {
    const k = readCString(bytes, p, end); p = k.next;
    const v = readCString(bytes, p, end); p = v.next;
    kv[k.value] = v.value;
  }
  return kv;
}

function parseBbox(dv, off, size) {
  if (size < 41) return null;
  const body = off + 16;
  const f = (i) => dv.getFloat32(body + 1 + 4 * i, true);
  return {
    min: [f(0), f(1), f(2)],
    max: [f(3), f(4), f(5)],
    center: [f(6), f(7), f(8)],
    radius: f(9),
  };
}

/** The GPCE tail stores pieceName\0 immediately before the ADSU chunk header. */
function pieceNameBefore(bytes, chunkOff, floor) {
  if (chunkOff - 1 <= floor || bytes[chunkOff - 1] !== 0) return '';
  let z = chunkOff - 2;
  while (z > floor && bytes[z] !== 0) z--;
  if (bytes[z] !== 0) return '';
  let s = '';
  for (let i = z + 1; i < chunkOff - 1; i++) {
    const b = bytes[i];
    if (b < 0x20 || b > 0x7e) return '';
    s += String.fromCharCode(b);
  }
  return s;
}

export function parseGeo(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const warnings = [];

  if (tagAt(bytes, 0) !== 'CHNK') throw new Error('not a CHNK container');

  // Root GBOD chunk at offset 8; sections are its direct ECPG children.
  const top = scanChildChunks(dv, bytes, 8, bytes.length);
  const roots = top.filter((c) => c.tag === 'DOBG');
  if (roots.length === 0) warnings.push('no GBOD root chunk found');

  const sections = [];
  let bodyBBox = null; // first DOBG-level XOBB = whole-body bounds in TRUE world units.
  for (const root of roots) {
    const rootBody = root.off + 16;
    for (const g of scanChildChunks(dv, bytes, rootBody, rootBody + root.size)) {
      if (g.tag === 'XOBB' && !bodyBBox) { bodyBBox = parseBbox(dv, g.off, g.size); continue; }
      if (g.tag !== 'ECPG') continue;
      const body = g.off + 16;
      const end = body + g.size;

      let trev = null, xdni = null, material = null, bbox = null, lod = 0, pieceName = '';
      for (const c of scanChildChunks(dv, bytes, body, end)) {
        if (c.tag === 'TREV') trev = c;
        else if (c.tag === 'XDNI') xdni = c;
        else if (c.tag === 'TCFE') material = parseEfct(dv, bytes, c.off, c.size, warnings);
        else if (c.tag === 'XOBB') bbox = parseBbox(dv, c.off, c.size);
        else if (c.tag === 'ADSU') {
          const kv = parseUsda(dv, bytes, c.off, c.size);
          lod = parseInt(kv.LODLevel ?? '0', 10) || 0;
          pieceName = pieceNameBefore(bytes, c.off, body);
        }
      }
      if (!trev || !xdni) {
        warnings.push(`GPCE @${g.off} without VERT+INDX pair, skipped`);
        continue;
      }
      try {
        const vb = parseTrev(dv, bytes, trev.off, trev.ver, warnings);
        const indices = parseXdni(dv, xdni.off, xdni.ver);
        // Drop out-of-range triangles (defensive; not observed in practice).
        let maxIndex = 0;
        for (let i = 0; i < indices.length; i++) if (indices[i] > maxIndex) maxIndex = indices[i];
        if (maxIndex >= vb.count) {
          warnings.push(`GPCE @${g.off}: index ${maxIndex} out of range (${vb.count} verts), skipped`);
          continue;
        }
        sections.push({
          name: pieceName,
          lod,
          effect: material ? material.effect : '',
          params: material ? material.params : {},
          positions: vb.positions,
          normals: vb.normals,
          uvs: vb.uvs,
          indices,
          stride: vb.stride,
          vertexCount: vb.count,
          triangleCount: indices.length / 3,
          bbox,
        });
      } catch (e) {
        warnings.push(`GPCE @${g.off}: ${e.message}`);
      }
    }
  }
  return { sections, warnings, bodyBBox };
}
