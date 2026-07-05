#!/usr/bin/env python3
"""
geo_to_obj.py

Batch-convert Auto Assault (VOG engine) chunked .geo mesh files to Wavefront OBJ/MTL,
with optional quick PNG preview renders placed beside each OBJ.

Implements the format documented in docs/geo-format.md (verified against the retail
client in Ghidra): walks the GBOD -> GPCE chunk tree, pairs each section's vertex
(TREV) and index (XDNI) buffers by GPCE siblinghood, decodes vertex attributes from
the embedded D3D9-style vertex declaration (LCED), and extracts each section's
material (EFCT effect name + PARM parameters: DiffuseTexture, NormalMapTexture,
MatDiffuse/Specular/Power, tint colors, ...) into per-section MTL materials.

Basic usage:
  python geo_to_obj.py --input ./geo_files --output ./obj_exports

Textured MTL (resolve texture names against an extracted textures folder):
  python geo_to_obj.py -i ./geo_files -o ./obj_exports --textures-dir assets/extracted/textures

Also generate preview PNG renders:
  python geo_to_obj.py --input ./geo_files --output ./obj_exports --render --workers 8

Useful options:
  --textures-dir DIR   Resolve material texture names to files and reference them in MTL.
  --stats-json FILE    Write per-file mesh/vertex/triangle/material stats (validation oracle).
  --front-render       Add a second straight-on/front PNG render per model.
  --contact-sheet      Make a single contact_sheet.png from generated renders.
  --workers N          Convert/render multiple files concurrently.
  --skip-existing      Skip outputs that already exist.
  --overwrite          Replace existing OBJ/PNG files.
  --no-recursive       Only process .geo files directly inside the input folder.
  --z-up-obj           Swap Y/Z when writing OBJ vertices, useful for Z-up tools.

Dependencies:
  OBJ export uses only the Python standard library.
  PNG renders require: pip install numpy matplotlib pillow
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
import pathlib
import struct
import sys
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

Vec3 = Tuple[float, float, float]
Vec2 = Tuple[float, float]
Face = Tuple[int, int, int]

# Chunk tags as they appear on disk (byte-reversed 4CCs; see docs/geo-format.md).
CHUNK_TAGS = {
    b"DOBG", b"ECPG", b"TCFE", b"MRAP", b"RTSI", b"TREV", b"XDNI",
    b"LCED", b"XOBB", b"NOBP", b"TADB", b"ADSU",
}

# D3DDECLTYPE -> size in bytes.
DECL_TYPE_SIZE = {0: 4, 1: 8, 2: 12, 3: 16, 4: 4, 5: 4, 6: 4, 7: 8, 8: 4, 9: 4,
                  10: 8, 11: 4, 12: 8, 13: 4, 14: 4, 15: 4, 16: 8}
# D3DDECLUSAGE values.
USAGE_POSITION = 0
USAGE_NORMAL = 3
USAGE_TEXCOORD = 5


@dataclass
class Material:
    effect: str = ""
    params: Dict[str, object] = field(default_factory=dict)

    @property
    def diffuse_texture(self) -> Optional[str]:
        v = self.params.get("DiffuseTexture")
        return v if isinstance(v, str) and v else None

    @property
    def normal_map_texture(self) -> Optional[str]:
        v = self.params.get("NormalMapTexture")
        return v if isinstance(v, str) and v else None

    def color4(self, name: str) -> Optional[Tuple[float, float, float, float]]:
        v = self.params.get(name)
        if isinstance(v, list) and len(v) >= 3:
            return (v[0], v[1], v[2], v[3] if len(v) > 3 else 1.0)
        return None


@dataclass
class Mesh:
    name: str
    verts: List[Vec3]
    normals: List[Vec3]
    uvs: List[Vec2]
    faces: List[Face]
    stride: int
    trev_offset: int
    xdni_offset: int
    material: Optional[Material] = None
    lod: int = 0
    piece_name: str = ""


def scan_child_chunks(data: bytes, start: int, end: int) -> List[Tuple[bytes, int, int, int]]:
    """Bounded scan for validated chunks inside a parent chunk's body [start, end).

    Chunks have non-chunk fields between them, so we scan for known tags and
    validate each candidate header: body fits inside the parent, version < 100,
    reserved dword == 0. Children found are skipped over wholesale.
    Returns (tag, offset, body_size, version) tuples.
    """
    out: List[Tuple[bytes, int, int, int]] = []
    i = start
    while i <= end - 16:
        tag = data[i:i + 4]
        if tag in CHUNK_TAGS:
            size, ver, resv = struct.unpack_from("<III", data, i + 4)
            if size <= end - (i + 16) and ver < 100 and resv == 0:
                out.append((tag, i, size, ver))
                i += 16 + size
                continue
        i += 1
    return out


def parse_decl(data: bytes, off: int) -> Tuple[List[Tuple[int, int, int, int]], int]:
    """Parse an LCED (DECL) chunk at `off`; returns (elements, end_offset).

    Elements are (d3dDeclType, stream, usage, usageIndex); attribute offsets are
    implicit (accumulate DECL_TYPE_SIZE in element order).
    """
    size = struct.unpack_from("<I", data, off + 4)[0]
    nel = struct.unpack_from("<I", data, off + 16)[0]
    if 4 + nel * 4 != size:
        raise ValueError(f"LCED size mismatch: {size} vs {4 + nel * 4}")
    els = [struct.unpack_from("<4B", data, off + 20 + 4 * i) for i in range(nel)]
    return els, off + 16 + size


def decl_layout(els: Sequence[Tuple[int, int, int, int]]) -> Tuple[Dict[Tuple[int, int], Tuple[int, int]], int]:
    """Map (usage, usageIndex) -> (byte offset, d3dDeclType); also return the stride."""
    offsets: Dict[Tuple[int, int], Tuple[int, int]] = {}
    cur = 0
    for (dtype, _stream, usage, uidx) in els:
        offsets[(usage, uidx)] = (cur, dtype)
        cur += DECL_TYPE_SIZE.get(dtype, 0)
    return offsets, cur


def _read_vec(data: bytes, off: int, dtype: int, want: int) -> Tuple[float, ...]:
    """Read up to `want` components of a DECL-typed attribute; pads with 0.0."""
    if dtype in (0, 1, 2, 3):        # FLOAT1..4
        n = min(dtype + 1, want)
        vals = struct.unpack_from(f"<{n}f", data, off)
    elif dtype == 15:                # FLOAT16_2
        vals = struct.unpack_from("<2e", data, off)[:want]
    elif dtype == 16:                # FLOAT16_4
        vals = struct.unpack_from("<4e", data, off)[:want]
    else:
        vals = ()
    return tuple(vals) + (0.0,) * (want - len(vals))


def parse_trev(data: bytes, off: int, ver: int) -> Tuple[List[Vec3], List[Vec3], List[Vec2], int]:
    """Parse a TREV (VERT) chunk. v3: id+stride+count+LCED+count2+data; v2: LCED+count+data."""
    size = struct.unpack_from("<I", data, off + 4)[0]
    body = off + 16
    end = body + size

    if ver >= 3:
        stride, count16 = struct.unpack_from("<HH", data, body + 4)
        if data[body + 8:body + 12] != b"LCED":
            raise ValueError("TREV v3 missing LCED at body+8")
        els, after = parse_decl(data, body + 8)
        count = struct.unpack_from("<I", data, after)[0]
        start = after + 4
    elif ver == 2:
        if data[body:body + 4] != b"LCED":
            raise ValueError("TREV v2 missing LCED at body+0")
        els, after = parse_decl(data, body)
        count = struct.unpack_from("<I", data, after)[0]
        start = after + 4
        stride = 0  # derived from decl below
    else:
        raise ValueError(f"unsupported TREV version {ver}")

    layout, decl_stride = decl_layout(els)
    if stride == 0:
        stride = decl_stride
    if decl_stride != stride:
        raise ValueError(f"DECL stride {decl_stride} != header stride {stride}")
    if start + count * stride > end:
        raise ValueError("TREV vertex data exceeds chunk body")

    pos = layout.get((USAGE_POSITION, 0))
    nrm = layout.get((USAGE_NORMAL, 0))
    uv = layout.get((USAGE_TEXCOORD, 0))

    verts: List[Vec3] = []
    normals: List[Vec3] = []
    uvs: List[Vec2] = []
    for i in range(count):
        rec = start + i * stride
        verts.append(_read_vec(data, rec + pos[0], pos[1], 3) if pos else (0.0, 0.0, 0.0))
        normals.append(_read_vec(data, rec + nrm[0], nrm[1], 3) if nrm else (0.0, 0.0, 0.0))
        uvs.append(_read_vec(data, rec + uv[0], uv[1], 2) if uv else (0.0, 0.0))
    return verts, normals, uvs, stride


def parse_xdni(data: bytes, off: int, ver: int) -> List[Face]:
    """Parse an XDNI (INDX) chunk into triangle-list faces. v2: id+isize+count+count2+data; v1: count+u16 data."""
    size = struct.unpack_from("<I", data, off + 4)[0]
    body = off + 16
    end = body + size

    if ver >= 2:
        index_size = struct.unpack_from("<H", data, body + 4)[0]
        count = struct.unpack_from("<I", data, body + 8)[0]
        start = body + 12
    elif ver == 1:
        index_size = 2
        count = struct.unpack_from("<I", data, body)[0]
        start = body + 4
    else:
        raise ValueError(f"unsupported XDNI version {ver}")

    if index_size == 2:
        fmt, step = "H", 2
    elif index_size == 4:
        fmt, step = "I", 4
    else:
        raise ValueError(f"unsupported XDNI index size: {index_size}")
    usable = min(count, (end - start) // step)
    raw = struct.unpack_from(f"<{usable}{fmt}", data, start) if usable else ()

    return [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw) - 2, 3)]


def _read_cstr(data: bytes, off: int, end: int) -> Tuple[str, int]:
    z = data.index(b"\x00", off, end)
    return data[off:z].decode("ascii", errors="replace"), z + 1


def parse_parm(data: bytes, off: int) -> Tuple[str, object]:
    """Parse a MRAP (PARM) chunk: name + typed value (see docs/geo-format.md)."""
    size = struct.unpack_from("<I", data, off + 4)[0]
    body = off + 16
    end = body + size
    name, p = _read_cstr(data, body, end)
    ptype = struct.unpack_from("<I", data, p)[0]
    p += 4
    value: object = None
    if ptype == 1:
        value = bool(struct.unpack_from("<I", data, p)[0])
    elif ptype == 2:
        value = struct.unpack_from("<I", data, p)[0]
    elif ptype == 3:
        cnt = struct.unpack_from("<I", data, p)[0]
        value = list(struct.unpack_from(f"<{cnt}f", data, p + 4))
    elif ptype == 4:
        value, _ = _read_cstr(data, p, end)
    elif ptype == 5:
        if data[p:p + 4] != b"RTSI":
            raise ValueError(f"PARM '{name}' type 5 without nested ISTR")
        ssize = struct.unpack_from("<I", data, p + 4)[0]
        value, _ = _read_cstr(data, p + 16, p + 16 + ssize)
    else:
        raise ValueError(f"PARM '{name}' has unknown value type {ptype}")
    return name, value


def parse_efct(data: bytes, off: int, size: int) -> Material:
    """Parse a TCFE (EFCT) chunk body: ISTR effect name + MRAP parameters."""
    mat = Material()
    for tag, coff, csize, _ver in scan_child_chunks(data, off + 16, off + 16 + size):
        if tag == b"RTSI" and not mat.effect:
            mat.effect, _ = _read_cstr(data, coff + 16, coff + 16 + csize)
        elif tag == b"MRAP":
            try:
                name, value = parse_parm(data, coff)
                mat.params[name] = value
            except (ValueError, struct.error):
                pass
    return mat


def parse_usda(data: bytes, off: int, size: int) -> Dict[str, str]:
    """Parse an ADSU (USDA) chunk: u32 pairCount + key\\0value\\0 pairs."""
    body = off + 16
    end = body + size
    cnt = struct.unpack_from("<I", data, body)[0]
    kv: Dict[str, str] = {}
    p = body + 4
    for _ in range(cnt):
        k, p = _read_cstr(data, p, end)
        v, p = _read_cstr(data, p, end)
        kv[k] = v
    return kv


def _piece_name_before(data: bytes, chunk_off: int, floor: int) -> str:
    """The GPCE tail stores pieceName\\0 immediately before the ADSU chunk header."""
    if chunk_off - 1 <= floor or data[chunk_off - 1] != 0:
        return ""
    z = data.rfind(b"\x00", floor, chunk_off - 1)
    if z < 0:
        return ""
    raw = data[z + 1:chunk_off - 1]
    try:
        return raw.decode("ascii")
    except UnicodeDecodeError:
        return ""


def parse_geo(path: pathlib.Path) -> List[Mesh]:
    """Parse all GPCE sections of a .geo per docs/geo-format.md."""
    data = path.read_bytes()
    if data[:4] != b"CHNK":
        raise ValueError("not a CHNK container")

    # Root GBOD (DOBG) chunk at offset 8; sections are its direct ECPG children.
    top = scan_child_chunks(data, 8, len(data))
    roots = [(off, size) for tag, off, size, _v in top if tag == b"DOBG"] or [(len(data) - 16, 0)]
    sections: List[Tuple[bytes, int, int, int]] = []
    for roff, rsize in roots:
        sections.extend(scan_child_chunks(data, roff + 16, roff + 16 + rsize))

    meshes: List[Mesh] = []
    for tag, goff, gsize, _gver in sections:
        if tag != b"ECPG":
            continue
        body = goff + 16
        end = body + gsize
        trev = xdni = None
        material: Optional[Material] = None
        lod = 0
        piece_name = ""
        for ctag, coff, csize, cver in scan_child_chunks(data, body, end):
            if ctag == b"TREV":
                trev = (coff, cver)
            elif ctag == b"XDNI":
                xdni = (coff, cver)
            elif ctag == b"TCFE":
                material = parse_efct(data, coff, csize)
            elif ctag == b"ADSU":
                try:
                    kv = parse_usda(data, coff, csize)
                    lod = int(kv.get("LODLevel", "0") or "0")
                except (ValueError, struct.error):
                    lod = 0
                piece_name = _piece_name_before(data, coff, body)
        if trev is None or xdni is None:
            continue
        verts, normals, uvs, stride = parse_trev(data, trev[0], trev[1])
        faces = parse_xdni(data, xdni[0], xdni[1])
        faces = [f for f in faces if max(f) < len(verts) and min(f) >= 0]
        if not verts or not faces:
            continue
        idx = len(meshes)
        meshes.append(
            Mesh(
                name=safe_obj_name(piece_name) if piece_name else f"{safe_obj_name(path.stem)}_mesh{idx}",
                verts=verts,
                normals=normals,
                uvs=uvs,
                faces=faces,
                stride=stride,
                trev_offset=trev[0],
                xdni_offset=xdni[0],
                material=material,
                lod=lod,
                piece_name=piece_name,
            )
        )
    return meshes


def safe_obj_name(name: str) -> str:
    out = []
    for ch in name:
        if ch.isalnum() or ch in "._-":
            out.append(ch)
        else:
            out.append("_")
    return "".join(out) or "mesh"


def has_useful_normals(normals: Sequence[Vec3]) -> bool:
    return any((x * x + y * y + z * z) > 0.0001 for x, y, z in normals)


def has_useful_uvs(uvs: Sequence[Vec2]) -> bool:
    return any(abs(u) > 0.000001 or abs(v) > 0.000001 for u, v in uvs)


def transform_vertex(v: Vec3, z_up_obj: bool) -> Vec3:
    if z_up_obj:
        # Source appears to be Y-up. This swaps Y/Z for Z-up OBJ import workflows.
        return (v[0], v[2], v[1])
    return v


def transform_normal(n: Vec3, z_up_obj: bool) -> Vec3:
    if z_up_obj:
        return (n[0], n[2], n[1])
    return n


# --- texture resolution (per worker process) --------------------------------

_TEXTURES_DIR: Optional[pathlib.Path] = None
_TEXTURE_INDEX: Optional[Dict[str, pathlib.Path]] = None


def _pool_init(textures_dir: Optional[str]) -> None:
    global _TEXTURES_DIR
    _TEXTURES_DIR = pathlib.Path(textures_dir) if textures_dir else None


def _texture_index() -> Dict[str, pathlib.Path]:
    """Lazy per-process index of lowercase texture basename -> path."""
    global _TEXTURE_INDEX
    if _TEXTURE_INDEX is None:
        idx: Dict[str, pathlib.Path] = {}
        if _TEXTURES_DIR is not None and _TEXTURES_DIR.is_dir():
            for p in _TEXTURES_DIR.rglob("*.dds"):
                idx.setdefault(p.name.lower(), p)
        _TEXTURE_INDEX = idx
    return _TEXTURE_INDEX


def resolve_texture(name: str) -> Optional[pathlib.Path]:
    """Resolve a material texture basename: exact -> mq_ -> lq_ -> prefix-stripped."""
    idx = _texture_index()
    if not idx or not name:
        return None
    key = name.lower()
    candidates = [key, f"mq_{key}", f"lq_{key}"]
    for prefix in ("lq_", "mq_"):
        if key.startswith(prefix):
            candidates.append(key[len(prefix):])
    for cand in candidates:
        hit = idx.get(cand)
        if hit is not None:
            return hit
    return None


# --- OBJ/MTL output ----------------------------------------------------------

def _mtl_name_for(mat: Optional[Material], index: int) -> str:
    if mat is not None and mat.diffuse_texture:
        return safe_obj_name(pathlib.Path(mat.diffuse_texture).stem)
    if mat is not None and mat.effect:
        return f"{safe_obj_name(pathlib.Path(mat.effect).stem)}_{index}"
    return f"material_{index}"


def _fmt_rgb(c: Tuple[float, float, float, float]) -> str:
    return f"{c[0]:.4f} {c[1]:.4f} {c[2]:.4f}"


def write_mtl(mtl_path: pathlib.Path, materials: Sequence[Tuple[str, Optional[Material]]],
              dest_dir: pathlib.Path) -> List[str]:
    """Write one newmtl per unique section material. Returns names of unresolved textures."""
    missing: List[str] = []
    with mtl_path.open("w", encoding="utf-8", newline="\n") as mtl:
        for name, mat in materials:
            mtl.write(f"newmtl {name}\n")
            if mat is None:
                mtl.write("Kd 0.72 0.72 0.72\nKa 0.20 0.20 0.20\nKs 0.12 0.12 0.12\nNs 16\n\n")
                continue
            kd = mat.color4("MatDiffuse") or (0.72, 0.72, 0.72, 1.0)
            ka = mat.color4("MatAmbient") or (0.2, 0.2, 0.2, 1.0)
            ks = mat.color4("MatSpecular") or (0.12, 0.12, 0.12, 1.0)
            power = mat.params.get("MatPower")
            ns = power[0] if isinstance(power, list) and power else (power if isinstance(power, (int, float)) else 16.0)
            emissive = mat.color4("MatEmissive")
            mtl.write(f"Kd {_fmt_rgb(kd)}\n")
            mtl.write(f"Ka {_fmt_rgb(ka)}\n")
            mtl.write(f"Ks {_fmt_rgb(ks)}\n")
            mtl.write(f"Ns {float(ns):.1f}\n")
            if emissive and any(v > 0.0 for v in emissive[:3]):
                mtl.write(f"Ke {_fmt_rgb(emissive)}\n")
            if mat.effect:
                mtl.write(f"# effect: {mat.effect}\n")
            for label, tex_name in (("map_Kd", mat.diffuse_texture), ("map_bump", mat.normal_map_texture)):
                if not tex_name:
                    continue
                resolved = resolve_texture(tex_name)
                if resolved is not None:
                    rel = os.path.relpath(resolved, dest_dir).replace("\\", "/")
                    if label == "map_bump":
                        mtl.write(f"map_bump {rel}\nnorm {rel}\n")
                    else:
                        mtl.write(f"{label} {rel}\n")
                else:
                    mtl.write(f"# missing texture: {tex_name}\n")
                    missing.append(tex_name)
            mtl.write("\n")
    return missing


def write_obj(
    source_path: pathlib.Path,
    meshes: Sequence[Mesh],
    out_dir: pathlib.Path,
    *,
    overwrite: bool = False,
    z_up_obj: bool = False,
) -> Tuple[pathlib.Path, List[str]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    obj_path = out_dir / f"{source_path.stem}.obj"
    mtl_path = out_dir / f"{source_path.stem}.mtl"

    if obj_path.exists() and not overwrite:
        raise FileExistsError(f"output exists, use --overwrite: {obj_path}")

    # Deduplicate identical materials across sections (keyed by effect + params).
    unique: List[Tuple[str, Optional[Material]]] = []
    mesh_mtl: List[str] = []
    seen: Dict[str, str] = {}
    for mesh in meshes:
        mat = mesh.material
        key = json.dumps([mat.effect, sorted(mat.params.items(), key=lambda kv: kv[0])],
                         default=str) if mat is not None else "<none>"
        if key not in seen:
            base = _mtl_name_for(mat, len(unique))
            name = base
            n = 1
            while any(existing == name for existing, _ in unique):
                name = f"{base}_{n}"
                n += 1
            seen[key] = name
            unique.append((name, mat))
        mesh_mtl.append(seen[key])

    missing = write_mtl(mtl_path, unique, out_dir)

    vertex_offset = 1
    uv_offset = 1
    normal_offset = 1

    with obj_path.open("w", encoding="utf-8", newline="\n") as obj:
        obj.write(f"# Extracted from {source_path.name}\n")
        obj.write(f"mtllib {mtl_path.name}\n")

        for mesh, mtl_name in zip(meshes, mesh_mtl):
            use_vt = has_useful_uvs(mesh.uvs) and len(mesh.uvs) == len(mesh.verts)
            use_vn = has_useful_normals(mesh.normals) and len(mesh.normals) == len(mesh.verts)

            obj.write(f"\no {mesh.name}\n")
            obj.write(f"usemtl {mtl_name}\n")

            for v in mesh.verts:
                x, y, z = transform_vertex(v, z_up_obj)
                obj.write(f"v {x:.8f} {y:.8f} {z:.8f}\n")

            if use_vt:
                for u, v in mesh.uvs:
                    # OBJ V texture coordinate convention is commonly flipped compared with game UVs.
                    obj.write(f"vt {u:.8f} {1.0 - v:.8f}\n")

            if use_vn:
                for n in mesh.normals:
                    x, y, z = transform_normal(n, z_up_obj)
                    obj.write(f"vn {x:.8f} {y:.8f} {z:.8f}\n")

            for a0, b0, c0 in mesh.faces:
                a, b, c = a0 + vertex_offset, b0 + vertex_offset, c0 + vertex_offset
                if use_vt and use_vn:
                    at, bt, ct = a0 + uv_offset, b0 + uv_offset, c0 + uv_offset
                    an, bn, cn = a0 + normal_offset, b0 + normal_offset, c0 + normal_offset
                    obj.write(f"f {a}/{at}/{an} {b}/{bt}/{bn} {c}/{ct}/{cn}\n")
                elif use_vt:
                    at, bt, ct = a0 + uv_offset, b0 + uv_offset, c0 + uv_offset
                    obj.write(f"f {a}/{at} {b}/{bt} {c}/{ct}\n")
                elif use_vn:
                    an, bn, cn = a0 + normal_offset, b0 + normal_offset, c0 + normal_offset
                    obj.write(f"f {a}//{an} {b}//{bn} {c}//{cn}\n")
                else:
                    obj.write(f"f {a} {b} {c}\n")

            vertex_offset += len(mesh.verts)
            if use_vt:
                uv_offset += len(mesh.uvs)
            if use_vn:
                normal_offset += len(mesh.normals)

    return obj_path, missing


def _require_render_deps():
    try:
        import numpy as np  # noqa: F401
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt  # noqa: F401
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: F401
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "PNG rendering requires numpy and matplotlib. Install with: "
            "pip install numpy matplotlib pillow"
        ) from exc


def render_png(
    source_path: pathlib.Path,
    meshes: Sequence[Mesh],
    out_dir: pathlib.Path,
    *,
    suffix: str = "",
    azim: float = -55,
    elev: float = 22,
    dpi: int = 160,
    size: float = 8.0,
    overwrite: bool = False,
) -> pathlib.Path:
    _require_render_deps()
    import numpy as np
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{source_path.stem}{suffix}.png"
    if out_path.exists() and not overwrite:
        raise FileExistsError(f"output exists, use --overwrite: {out_path}")

    def to_plot_coords(verts: Sequence[Vec3]):
        arr = np.asarray(verts, dtype=float)
        # Source appears X/Y/Z with Y-up. Matplotlib 3D uses Z as vertical.
        return np.column_stack([arr[:, 0], arr[:, 2], arr[:, 1]])

    def shade_faces(verts_arr, faces_arr, base_rgb):
        if len(faces_arr) == 0:
            return []
        tri = verts_arr[faces_arr]
        n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        norm = np.linalg.norm(n, axis=1)
        norm[norm == 0] = 1.0
        n = n / norm[:, None]
        light = np.array([0.35, -0.55, 0.95], dtype=float)
        light = light / np.linalg.norm(light)
        lum = np.clip(n @ light, 0, 1)
        lum = 0.34 + 0.66 * lum
        return [tuple(np.clip(np.array(base_rgb) * l, 0, 1)) + (1.0,) for l in lum]

    fig = plt.figure(figsize=(size, size), dpi=dpi)
    ax = fig.add_subplot(111, projection="3d")
    ax.set_proj_type("ortho")
    fig.patch.set_facecolor("#1a1a1a")
    ax.set_facecolor("#1a1a1a")

    colors = [
        (0.72, 0.72, 0.68),
        (0.55, 0.64, 0.78),
        (0.72, 0.56, 0.48),
        (0.62, 0.72, 0.62),
    ]
    all_plot = []

    for mesh_idx, mesh in enumerate(meshes):
        pv = to_plot_coords(mesh.verts)
        faces_arr = np.asarray(mesh.faces, dtype=int)
        all_plot.append(pv)
        polys = pv[faces_arr]
        fcols = shade_faces(pv, faces_arr, colors[mesh_idx % len(colors)])
        coll = Poly3DCollection(
            polys,
            facecolors=fcols,
            edgecolor=(0.02, 0.02, 0.02, 0.34),
            linewidths=0.18,
        )
        ax.add_collection3d(coll)

    allv = np.vstack(all_plot)
    minb = allv.min(axis=0)
    maxb = allv.max(axis=0)
    center = (minb + maxb) / 2.0
    span = float((maxb - minb).max())
    if span <= 0:
        span = 1.0
    pad = span * 0.55
    ax.set_xlim(center[0] - pad, center[0] + pad)
    ax.set_ylim(center[1] - pad, center[1] + pad)
    ax.set_zlim(center[2] - pad, center[2] + pad)
    try:
        ax.set_box_aspect([1, 1, 1])
    except Exception:
        pass
    ax.view_init(elev=elev, azim=azim)
    try:
        ax.dist = 7
    except Exception:
        pass
    ax.set_axis_off()

    stats = ", ".join(f"m{i}: {len(m.verts)}v/{len(m.faces)}t" for i, m in enumerate(meshes))
    ax.text2D(0.03, 0.96, source_path.name, transform=ax.transAxes, color="white", fontsize=10, alpha=0.86)
    ax.text2D(0.03, 0.925, stats, transform=ax.transAxes, color="white", fontsize=7, alpha=0.62)

    plt.savefig(out_path, facecolor=fig.get_facecolor(), bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)
    return out_path


def make_contact_sheet(image_paths: Sequence[pathlib.Path], out_path: pathlib.Path, *, overwrite: bool = False) -> Optional[pathlib.Path]:
    if not image_paths:
        return None
    try:
        from PIL import Image, ImageDraw, ImageOps
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("Contact sheet requires Pillow. Install with: pip install pillow") from exc

    if out_path.exists() and not overwrite:
        raise FileExistsError(f"output exists, use --overwrite: {out_path}")

    thumbs = []
    for img_path in image_paths:
        img = Image.open(img_path).convert("RGB")
        img = ImageOps.pad(img, (460, 460), color=(26, 26, 26))
        thumbs.append((img, img_path))

    cols = 3
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new("RGB", (cols * 460, rows * 500), (18, 18, 18))
    draw = ImageDraw.Draw(sheet)
    for idx, (img, p) in enumerate(thumbs):
        x = (idx % cols) * 460
        y = (idx // cols) * 500
        sheet.paste(img, (x, y))
        draw.text((x + 12, y + 464), p.name, fill=(235, 235, 235))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    return out_path


def iter_geo_files(input_dir: pathlib.Path, recursive: bool) -> Iterable[pathlib.Path]:
    pattern = "**/*.geo" if recursive else "*.geo"
    yield from sorted(p for p in input_dir.glob(pattern) if p.is_file())


def output_dir_for(source: pathlib.Path, input_dir: pathlib.Path, output_dir: pathlib.Path, flat: bool) -> pathlib.Path:
    if flat:
        return output_dir
    try:
        rel_parent = source.parent.relative_to(input_dir).as_posix()
    except ValueError:
        rel_parent = ""
    return output_dir if rel_parent in ("", ".") else output_dir / rel_parent



def choose_default_workers(render: bool) -> int:
    """Pick a reasonable default worker count.

    OBJ-only conversion is lightweight, so more workers are usually fine. Rendering uses
    matplotlib and can consume much more RAM, so the render default is intentionally capped.
    Override with --workers when you know your machine can handle more.
    """
    cpu = os.cpu_count() or 1
    if render:
        return max(1, min(cpu - 1 if cpu > 1 else 1, 4))
    return max(1, min(cpu - 1 if cpu > 1 else 1, 12))


def _path_exists_for_job(path: pathlib.Path) -> bool:
    try:
        return path.exists()
    except OSError:
        return False


def process_one_geo_file(job: dict) -> dict:
    """Worker entry point for process-based concurrent conversion/rendering."""
    geo_path = pathlib.Path(job["geo_path"])
    input_dir = pathlib.Path(job["input_dir"])
    output_dir = pathlib.Path(job["output_dir"])

    try:
        rel = geo_path.relative_to(input_dir)
    except ValueError:
        rel = pathlib.Path(geo_path.name)

    dest_dir = output_dir_for(geo_path, input_dir, output_dir, flat=bool(job["flat"]))
    obj_path = dest_dir / f"{geo_path.stem}.obj"
    mtl_path = dest_dir / f"{geo_path.stem}.mtl"
    main_png = dest_dir / f"{geo_path.stem}.png"
    front_png = dest_dir / f"{geo_path.stem}_front.png"

    logs: List[str] = []
    started = time.perf_counter()

    try:
        meshes = parse_geo(geo_path)
        if not meshes:
            raise ValueError("no GPCE sections with vertex+index data found")

        vertex_count = sum(len(m.verts) for m in meshes)
        tri_count = sum(len(m.faces) for m in meshes)

        stats = {
            "meshes": len(meshes),
            "verts": [len(m.verts) for m in meshes],
            "tris": [len(m.faces) for m in meshes],
            "strides": [m.stride for m in meshes],
            "lods": [m.lod for m in meshes],
            "materials": [
                {
                    "effect": m.material.effect if m.material else "",
                    "diffuse": m.material.diffuse_texture if m.material else None,
                    "normal": m.material.normal_map_texture if m.material else None,
                }
                for m in meshes
            ],
        }

        skip_existing = bool(job["skip_existing"])
        overwrite = bool(job["overwrite"])

        if skip_existing and _path_exists_for_job(obj_path) and _path_exists_for_job(mtl_path) and not overwrite:
            logs.append(f"OBJ skipped existing: {obj_path}")
        else:
            written_obj, missing_textures = write_obj(
                geo_path,
                meshes,
                dest_dir,
                overwrite=overwrite,
                z_up_obj=bool(job["z_up_obj"]),
            )
            logs.append(f"OBJ: {written_obj} ({len(meshes)} mesh(es), {vertex_count} vertices, {tri_count} triangles)")
            if missing_textures:
                logs.append(f"missing textures: {', '.join(sorted(set(missing_textures)))}")

        rendered_main = None
        if bool(job["render"]):
            if skip_existing and _path_exists_for_job(main_png) and not overwrite:
                rendered_main = main_png
                logs.append(f"PNG skipped existing: {main_png}")
            else:
                rendered_main = render_png(
                    geo_path,
                    meshes,
                    dest_dir,
                    azim=float(job["azim"]),
                    elev=float(job["elev"]),
                    dpi=int(job["dpi"]),
                    size=float(job["size"]),
                    overwrite=overwrite,
                )
                logs.append(f"PNG: {rendered_main}")

            if bool(job["front_render"]):
                if skip_existing and _path_exists_for_job(front_png) and not overwrite:
                    logs.append(f"PNG skipped existing: {front_png}")
                else:
                    written_front = render_png(
                        geo_path,
                        meshes,
                        dest_dir,
                        suffix="_front",
                        azim=-90,
                        elev=0,
                        dpi=int(job["dpi"]),
                        size=float(job["size"]),
                        overwrite=overwrite,
                    )
                    logs.append(f"PNG: {written_front}")

        elapsed = time.perf_counter() - started
        return {
            "ok": True,
            "skipped": False,
            "rel": str(rel),
            "logs": logs,
            "stats": stats,
            "rendered_main": str(rendered_main) if rendered_main else None,
            "elapsed": elapsed,
        }
    except Exception as exc:
        elapsed = time.perf_counter() - started
        return {
            "ok": False,
            "skipped": False,
            "rel": str(rel),
            "logs": logs,
            "error": f"{type(exc).__name__}: {exc}",
            "rendered_main": None,
            "elapsed": elapsed,
        }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Batch-convert Auto Assault .geo files to OBJ/MTL (textured, per docs/geo-format.md) with optional PNG renders."
    )
    parser.add_argument("--input", "-i", required=True, help="Input folder containing .geo files.")
    parser.add_argument("--output", "-o", required=True, help="Output folder for OBJ/MTL and optional PNG files.")
    parser.add_argument("--textures-dir", help="Extracted textures folder; material texture names are resolved against it and referenced from MTL (relative paths).")
    parser.add_argument("--stats-json", help="Write per-file stats JSON (meshes/verts/tris/strides/materials) to this path.")
    parser.add_argument("--render", action="store_true", help="Generate a PNG render beside each OBJ.")
    parser.add_argument("--workers", "-j", type=int, default=0, help="Number of concurrent worker processes. Default: auto; OBJ-only caps at 12, rendering caps at 4.")
    parser.add_argument("--skip-existing", action="store_true", help="Skip OBJ/PNG files that already exist instead of failing. Useful for resuming large batches.")
    parser.add_argument("--front-render", action="store_true", help="Also generate a front/straight-on PNG render beside each OBJ.")
    parser.add_argument("--contact-sheet", action="store_true", help="Create contact_sheet.png from generated main renders.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing output files.")
    parser.add_argument("--no-recursive", action="store_true", help="Only process .geo files directly in the input folder.")
    parser.add_argument("--flat", action="store_true", help="Put all output files directly in the output folder instead of preserving subfolders.")
    parser.add_argument("--z-up-obj", action="store_true", help="Swap Y/Z when writing OBJ vertices/normals for Z-up workflows.")
    parser.add_argument("--azim", type=float, default=-55.0, help="Render azimuth angle. Default: -55")
    parser.add_argument("--elev", type=float, default=22.0, help="Render elevation angle. Default: 22")
    parser.add_argument("--dpi", type=int, default=160, help="Render DPI. Default: 160")
    parser.add_argument("--size", type=float, default=8.0, help="Render figure size in inches. Default: 8")
    return parser



def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)

    input_dir = pathlib.Path(args.input).expanduser().resolve()
    output_dir = pathlib.Path(args.output).expanduser().resolve()

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"ERROR: input folder does not exist or is not a directory: {input_dir}", file=sys.stderr)
        return 2

    textures_dir = None
    if args.textures_dir:
        textures_dir = pathlib.Path(args.textures_dir).expanduser().resolve()
        if not textures_dir.is_dir():
            print(f"ERROR: --textures-dir does not exist: {textures_dir}", file=sys.stderr)
            return 2

    files = list(iter_geo_files(input_dir, recursive=not args.no_recursive))
    if not files:
        print(f"No .geo files found in {input_dir}")
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    rendered_main: List[pathlib.Path] = []
    all_stats: Dict[str, dict] = {}
    ok = 0
    failed = 0

    workers = int(args.workers or 0)
    if workers <= 0:
        workers = choose_default_workers(render=bool(args.render))
    workers = max(1, min(workers, len(files)))

    print(f"Found {len(files)} .geo file(s).")
    print(f"Using {workers} worker process(es).")
    if args.render and workers > 4:
        print("NOTE: Rendering with many workers can use a lot of RAM. Lower --workers if the system starts swapping.")

    base_job = {
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "render": bool(args.render),
        "front_render": bool(args.front_render),
        "overwrite": bool(args.overwrite),
        "skip_existing": bool(args.skip_existing),
        "flat": bool(args.flat),
        "z_up_obj": bool(args.z_up_obj),
        "azim": float(args.azim),
        "elev": float(args.elev),
        "dpi": int(args.dpi),
        "size": float(args.size),
    }

    started_all = time.perf_counter()

    def consume(result: dict, geo_path: pathlib.Path, position: int) -> None:
        nonlocal ok, failed
        rel = result.get("rel", geo_path.name)
        print(f"[{position}/{len(files)}] {rel} ({result.get('elapsed', 0):.2f}s)")
        for line in result.get("logs", []):
            print(f"  {line}")
        if result.get("ok"):
            ok += 1
            if result.get("stats"):
                all_stats[str(rel).replace("\\", "/")] = result["stats"]
            if result.get("rendered_main"):
                rendered_main.append(pathlib.Path(result["rendered_main"]))
        else:
            failed += 1
            print(f"  ERROR: {result.get('error', 'unknown error')}", file=sys.stderr)

    if workers == 1:
        _pool_init(str(textures_dir) if textures_dir else None)
        for idx, geo_path in enumerate(files, 1):
            job = dict(base_job)
            job["geo_path"] = str(geo_path)
            consume(process_one_geo_file(job), geo_path, idx)
    else:
        with ProcessPoolExecutor(
            max_workers=workers,
            initializer=_pool_init,
            initargs=(str(textures_dir) if textures_dir else None,),
        ) as pool:
            future_to_path = {}
            for geo_path in files:
                job = dict(base_job)
                job["geo_path"] = str(geo_path)
                fut = pool.submit(process_one_geo_file, job)
                future_to_path[fut] = geo_path

            completed = 0
            for fut in as_completed(future_to_path):
                completed += 1
                geo_path = future_to_path[fut]
                try:
                    result = fut.result()
                except Exception as exc:
                    failed += 1
                    print(f"[{completed}/{len(files)}] {geo_path.name}")
                    print(f"  ERROR: worker crashed: {type(exc).__name__}: {exc}", file=sys.stderr)
                    continue
                consume(result, geo_path, completed)

    if args.stats_json:
        stats_path = pathlib.Path(args.stats_json).expanduser().resolve()
        stats_path.parent.mkdir(parents=True, exist_ok=True)
        with stats_path.open("w", encoding="utf-8", newline="\n") as fh:
            json.dump(all_stats, fh, indent=1, sort_keys=True)
        print(f"Stats JSON: {stats_path} ({len(all_stats)} file(s))")

    if args.render and args.contact_sheet:
        try:
            # Stable contact-sheet order, even though workers finish out of order.
            rendered_main = sorted(rendered_main, key=lambda p: p.as_posix().lower())
            sheet = make_contact_sheet(rendered_main, output_dir / "contact_sheet.png", overwrite=args.overwrite or args.skip_existing)
            if sheet:
                print(f"Contact sheet: {sheet}")
        except Exception as exc:
            failed += 1
            print(f"Contact sheet ERROR: {exc}", file=sys.stderr)

    elapsed_all = time.perf_counter() - started_all
    print(f"Done. Converted: {ok}. Failed: {failed}. Output: {output_dir}. Time: {elapsed_all:.2f}s")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
