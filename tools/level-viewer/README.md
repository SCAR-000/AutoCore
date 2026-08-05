# AutoCore Level Viewer

Whole-map three.js viewer for Auto Assault: terrain heightfield, instanced `.geo`
placements, markers, paths, triggers, and reaction graphs.

## Prerequisites

1. A retail Auto Assault install (for MapDump / AssetExtractor).
2. Extracted assets under `assets/extracted/` (maps, models, textures, data).
3. **Node ≥ 18** for unit tests / audit script; **.NET 8** for MapDump; **Python 3** for index builders.

Extract game assets once (shared tool, not in this package):

```bash
dotnet run --project tools/AutoCore.AssetExtractor -- "<gamePath>" assets/extracted
```

## Build dump data

```bash
# Model + texture index (index.json)
python tools/level-viewer/build_viewer_index.py

# Per-map placement / trigger / reaction JSON (levels/)
dotnet run --project tools/level-viewer/AutoCore.MapDump -- \
  "<gamePath>" assets/extracted/maps tools/level-viewer/levels

# Environment lighting (env-lighting.json)
python tools/level-viewer/build_env_lighting.py
```

Optional resolution audit:

```bash
node tools/level-viewer/audit-level-resolution.js
```

## Run the viewer

Serve the **repo root** (asset paths are repo-relative via `ROOT = '../../'`):

```bash
python -m http.server 8080
# http://localhost:8080/tools/level-viewer/level.html
# deep-link: .../level.html#sec_f_h_map_tut_j2_arkbaytutorial
```

## Tests

```bash
dotnet build tools/level-viewer/AutoCore.MapDump/AutoCore.MapDump.csproj
dotnet test tools/level-viewer/AutoCore.MapDump.Tests/AutoCore.MapDump.Tests.csproj
node --test tools/level-viewer/*.test.js tools/level-viewer/*.test.mjs
```

## Layout

| Path | Role |
|------|------|
| `level.html` / `level.js` | Viewer entry |
| `levels/` | MapDump output (per-map JSON + `levels-index.json`) |
| `index.json` | Model/texture index from `build_viewer_index.py` |
| `tileset-table.json` | Terrain tileset → atlas mapping (static RE data) |
| `env-lighting.json` | Region/time-of-day lighting from `build_env_lighting.py` |
| `AutoCore.MapDump/` | C# map dump tool |
| Shared modules | `geo-parser`, `materials`, `model-resolve`, trigger/reaction stack, fly controls |

Game binary assets (`.geo`, `.dds`, map `.tga`) stay under `assets/extracted/` — not vendored here.
