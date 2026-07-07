# Documentation

## Viewers and formats

- [Level renderer](level-renderer.md) — whole-map viewer (`tools/model-viewer/level.html`)
- [Terrain format findings](terrain-format-findings.md) — map TGA channels, tileset RE
- [Geo format](geo-format.md) — `.geo` mesh/material parser shared by model viewer

## Game systems

- [Ark Bay tutorial (arkgetaway)](arkgetaway.md) — `sec_f_h_map_tut_j2_arkbaytutorial` triggers, missions, exit flow
- [Reaction types](reaction-types.md) — map trigger reaction semantics (Ghidra RE + shared catalog)
- [Vehicle physics port](vehicle-physics-port.md) — drivable demo (`play.html`)
- [VFX viewer](vfx-viewer.md) — NFX particle preview (`tools/model-viewer/vfx.html`)

## Related projects

- **AutoAssault.web** `/play` — browser Ark Bay playtest (Next.js + Colyseus; sibling repo)

## Tools

- `tools/build_viewer_index.py` — build `tools/model-viewer/index.json`
- `tools/AutoCore.MapDump/` — dump `.fam` maps to level JSON
- `tools/audit-level-resolution.js` — per-map model resolution report
