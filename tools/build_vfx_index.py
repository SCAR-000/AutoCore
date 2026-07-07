#!/usr/bin/env python3
"""
build_vfx_index.py

Generate tools/model-viewer/vfx-index.json for the VFX viewer: metadata for all
extracted *_nfx.xml particle effect definitions.

Usage (from the repo root):
  python tools/build_vfx_index.py
  python tools/build_vfx_index.py --data-root assets/extracted/data --models-root assets/extracted/models
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET


def repo_relative(path: pathlib.Path, repo_root: pathlib.Path) -> str:
    return path.relative_to(repo_root).as_posix()


def categorize(name: str) -> str:
    lower = name.lower()
    prefixes = (
        ("sec_fx", "sec_fx"),
        ("weather_", "weather"),
        ("fx_template_", "fx_template"),
        ("fx_", "fx"),
        ("env_", "env"),
        ("char_", "char"),
        ("weap_", "weap"),
        ("generic_", "generic"),
        ("include_", "include"),
        ("cont_fx_", "cont_fx"),
        ("mon_", "mon"),
        ("item_", "item"),
        ("wra_", "wra"),
        ("veh_", "veh"),
    )
    for prefix, cat in prefixes:
        if lower.startswith(prefix):
            return cat
    if "explosion" in lower or "smoke" in lower or "fire" in lower:
        return "combat"
    return "other"


def parse_events_and_summary(text: str) -> tuple[list[str], dict[str, int], list[str]]:
    events: list[str] = []
    summary = {"particles": 0, "trails": 0, "lightning": 0, "geometry": 0, "sounds": 0}
    texture_ids: set[str] = set()

    # Fast regex pass for index metadata (tolerates malformed XML comments).
    for m in re.finditer(r'<NDSpecialFX\b[^>]*\bevent="([^"]+)"', text, re.I):
        for ev in m.group(1).split("|"):
            ev = ev.strip()
            if ev and ev not in events:
                events.append(ev)

    summary["particles"] = len(re.findall(r"<Particle\b", text, re.I))
    summary["trails"] = len(re.findall(r"<Trail\b", text, re.I))
    summary["lightning"] = len(re.findall(r"<Lightning\b", text, re.I))
    summary["geometry"] = len(re.findall(r"<Geometry\b", text, re.I))
    summary["sounds"] = len(re.findall(r"<Sound\b", text, re.I))

    for m in re.finditer(r'\b(?:textureID|shadowTextureID)="([^"]+)"', text, re.I):
        for part in re.split(r"[\s,]+", m.group(1).strip()):
            if part:
                texture_ids.add(part.upper())

    # Fallback event parse via ElementTree when regex found nothing.
    if not events:
        try:
            root = ET.fromstring(text)
            for node in root.iter("NDSpecialFX"):
                ev = node.get("event") or ""
                for part in ev.split("|"):
                    part = part.strip()
                    if part and part not in events:
                        events.append(part)
        except ET.ParseError:
            pass

    return events, summary, sorted(texture_ids)


def build_geo_lookup(models_root: pathlib.Path) -> dict[str, str]:
    lookup: dict[str, str] = {}
    if not models_root.is_dir():
        return lookup
    for p in models_root.rglob("*.geo"):
        stem = p.stem.lower()
        lookup.setdefault(stem, p.as_posix())
    return lookup


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build the VFX viewer index.")
    parser.add_argument("--data-root", default="assets/extracted/data",
                        help="Directory containing *_nfx.xml files.")
    parser.add_argument("--models-root", default="assets/extracted/models",
                        help="Directory containing .geo models for geoPath linking.")
    parser.add_argument("--output", default="tools/model-viewer/vfx-index.json",
                        help="Output JSON path.")
    args = parser.parse_args(argv)

    repo_root = pathlib.Path(__file__).resolve().parent.parent
    data_root = pathlib.Path(args.data_root)
    if not data_root.is_absolute():
        data_root = repo_root / data_root
    models_root = pathlib.Path(args.models_root)
    if not models_root.is_absolute():
        models_root = repo_root / models_root

    if not data_root.is_dir():
        print(f"ERROR: data root missing: {data_root}", file=sys.stderr)
        return 1

    geo_lookup = build_geo_lookup(models_root)
    effects = []

    for p in sorted(data_root.glob("*_nfx.xml")):
        text = p.read_text(encoding="utf-8", errors="replace")
        name = p.name[: -len("_nfx.xml")]
        events, summary, texture_ids = parse_events_and_summary(text)
        rel = repo_relative(p, repo_root)
        geo_key = name.lower()
        geo_abs = geo_lookup.get(geo_key)
        geo_path = repo_relative(pathlib.Path(geo_abs), repo_root) if geo_abs else None

        effects.append({
            "name": name,
            "path": rel,
            "size": p.stat().st_size,
            "category": categorize(name),
            "events": events,
            "summary": summary,
            "textureIds": texture_ids,
            "geoPath": geo_path,
        })

    effects.sort(key=lambda e: e["name"].lower())

    out_path = pathlib.Path(args.output)
    if not out_path.is_absolute():
        out_path = repo_root / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump({"effects": effects}, fh, separators=(",", ":"))

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"{out_path}: {len(effects)} effects ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
