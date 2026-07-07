#!/usr/bin/env python3
"""Build tools/model-viewer/env-lighting.json from the game's environment NFX files.

Auto Assault stores per-region lighting in assets/extracted/data/env_<zone>[_<subarea>]_<tod>_nfx.xml.
Each carries a single <Environment .../> node (parsed by CVOGTerrain env loader FUN_004a18b0):
  hemiTopColor / hemiBottomColor  -> hemispheric sky/ground light  (RGB 0-255)
  directionalDifuse               -> sun color                     (RGB 0-255)
  directionalDirection            -> sun travel direction          (vec3)
  directionalAmbient              -> extra ambient                 (RGB 0-255, optional)
  fogColor/fogStart/fogDensity/farPlaneDistance, skyName, skyTint1/2, cloudName

The terrain shader (NDDiffTerrainLayered2.fx) lights each vertex as
  light = lerp(hemiBottom, hemiTop, 0.5*(N.y+1)) + saturate(dot(N,-dir)) * sunColor
  final = 2 * vertColor(tint) * light * albedo

Output keys are the env name without the trailing _<tod>_nfx, each with a `tod` map
(dawn/midday/night/sunset) so the viewer can pick region + time-of-day.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "assets" / "extracted" / "data"
OUT = ROOT / "tools" / "model-viewer" / "env-lighting.json"

ENV_RE = re.compile(r"<Environment\b([^>]*?)/?>", re.IGNORECASE | re.DOTALL)
ATTR_RE = re.compile(r'(\w+)\s*=\s*"([^"]*)"')
NAME_RE = re.compile(r"^(env_.+?)_(dawn|midday|night|sunset)_nfx$", re.IGNORECASE)


def nums(s):
    return [float(x) for x in re.findall(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)", s)]


def rgb(s):
    v = nums(s)
    return [round(v[0]), round(v[1]), round(v[2])] if len(v) >= 3 else None


def parse_env(text):
    m = ENV_RE.search(text)
    if not m:
        return None
    a = {k.lower(): v for k, v in ATTR_RE.findall(m.group(1))}
    out = {}
    if "hemitopcolor" in a:      out["hemiTop"] = rgb(a["hemitopcolor"])
    if "hemibottomcolor" in a:   out["hemiBottom"] = rgb(a["hemibottomcolor"])
    if "directionaldifuse" in a: out["sun"] = rgb(a["directionaldifuse"])
    if "directionalambient" in a: out["ambient"] = rgb(a["directionalambient"])
    if "directionaldirection" in a:
        d = nums(a["directionaldirection"])
        if len(d) >= 3: out["dir"] = d[:3]
    if "fogcolor" in a:          out["fogColor"] = rgb(a["fogcolor"])
    for k_src, k_dst in (("fogstart", "fogStart"), ("fogdensity", "fogDensity"),
                         ("farplanedistance", "far")):
        if k_src in a:
            n = nums(a[k_src])
            if n: out[k_dst] = n[0]
    for k in ("skyname", "cloudname"):
        if k in a and a[k]:
            out["skyName" if k == "skyname" else "cloudName"] = a[k]
    if "skytint1" in a: out["skyTint1"] = rgb(a["skytint1"])
    if "skytint2" in a: out["skyTint2"] = rgb(a["skytint2"])
    return out or None


def main():
    envs = {}
    files = sorted(DATA.glob("env_*_nfx.xml"))
    parsed = 0
    for f in files:
        m = NAME_RE.match(f.stem)
        if not m:
            continue
        base, tod = m.group(1), m.group(2).lower()
        try:
            data = parse_env(f.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
        if not data:
            continue
        rec = envs.setdefault(base.lower(), {"zone": base.split("_")[3] if base.count("_") >= 3 else base,
                                             "tod": {}})
        rec["tod"][tod] = data
        parsed += 1
    envs = {k: envs[k] for k in sorted(envs)}
    OUT.write_text(json.dumps(envs, separators=(",", ":")), encoding="utf-8")
    print(f"parsed {parsed} env keyframes from {len(files)} files -> {len(envs)} environments")
    print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
