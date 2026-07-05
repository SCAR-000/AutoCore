#!/usr/bin/env python3
"""
build_viewer_index.py

Generate tools/model-viewer/index.json for the three.js model viewer: a list of all
extracted .geo models plus a lowercase-basename -> path map of all .dds textures.
Paths are repo-root-relative (the viewer is served with a static HTTP server from the
repo root, e.g. `python -m http.server 8080`).

Usage (from the repo root):
  python tools/build_viewer_index.py
  python tools/build_viewer_index.py --roots assets/extracted assets/buggy --output tools/model-viewer/index.json
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys


def repo_relative(path: pathlib.Path, repo_root: pathlib.Path) -> str:
    return path.relative_to(repo_root).as_posix()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build the model-viewer asset index.")
    parser.add_argument("--roots", nargs="+", default=["assets/extracted", "assets/buggy"],
                        help="Asset roots to scan (repo-root-relative or absolute inside the repo).")
    parser.add_argument("--output", default="tools/model-viewer/index.json",
                        help="Output JSON path. Default: tools/model-viewer/index.json")
    args = parser.parse_args(argv)

    repo_root = pathlib.Path(__file__).resolve().parent.parent

    models = []
    textures: dict[str, str] = {}
    seen_models: set[str] = set()

    for root_arg in args.roots:
        root = pathlib.Path(root_arg)
        if not root.is_absolute():
            root = repo_root / root
        if not root.is_dir():
            print(f"WARNING: skipping missing root {root}", file=sys.stderr)
            continue

        for p in sorted(root.rglob("*")):
            if not p.is_file():
                continue
            suffix = p.suffix.lower()
            if suffix == ".geo":
                rel = repo_relative(p, repo_root)
                key = p.name.lower()
                # First root wins on duplicate file names (mirrors extractor dedup).
                if key in seen_models:
                    continue
                seen_models.add(key)
                try:
                    category = p.parent.relative_to(root).as_posix()
                except ValueError:
                    category = ""
                models.append({
                    "name": p.name,
                    "path": rel,
                    "size": p.stat().st_size,
                    "category": category if category != "." else "",
                })
            elif suffix == ".dds":
                textures.setdefault(p.name.lower(), repo_relative(p, repo_root))

    models.sort(key=lambda m: m["name"].lower())

    out_path = pathlib.Path(args.output)
    if not out_path.is_absolute():
        out_path = repo_root / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump({"models": models, "textures": textures}, fh, separators=(",", ":"))

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"{out_path}: {len(models)} models, {len(textures)} textures ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
