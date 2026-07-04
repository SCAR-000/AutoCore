# Level Renderer

Renders an entire Auto Assault map in three.js: terrain heightfield + every object
placement (instanced `.geo` models) + spawn/store/path markers. Built on the same
`.geo` parser and material system as the model viewer (`docs/geo-format.md`).

## Run it

```
# 1. (once) extract assets + build the model/texture index — see docs/geo-format.md
python tools/build_viewer_index.py

# 2. dump every map's placements to JSON (needs clonebase.wad; no MySQL)
tools/AutoCore.MapDump/bin/Release/net8.0/mapdump.exe \
    "C:\Program Files (x86)\NetDevil\Auto Assault" \
    assets/extracted/maps  tools/model-viewer/levels

# 3. serve the repo root and open the level viewer
python -m http.server 8080     # from repo root
#   http://localhost:8080/tools/model-viewer/level.html
```

Deep-link a specific map with `#<mapname>` (e.g. `level.html#sec_f_m_map_town_e7_1_citadel`).

## Pipeline

1. **`tools/AutoCore.MapDump/`** (C#, references `AutoCore.Game`) — loads `clonebase.wad`
   via the new `AssetManager.LoadCloneBasesOnly()` (no world DB / MySQL), then for each
   extracted `.fam` runs the server's own `MapData.Read` parser and emits
   `tools/model-viewer/levels/<map>.json`:
   - `Terrain`: `Width`, `Height`, `GridSize`, `HeightScale` (4.0), `Entry`, `Tga` path.
     (Width/Height are read directly from the `.fam` header since `MapData` discards them.)
   - `Objects`: every `GraphicsObjectTemplate` placement — `Cbid`, `Coid`, `Pos[3]`,
     `Rot[4]` (quaternion), `Scale`, and name candidates `Physics`/`Unique`/`Short`/`Type`.
   - `Markers`: spawn / enter / store / outpost points.
   - `Paths`: map-path polylines.
   Plus `levels-index.json` (map list + counts). All 104 extracted maps parse (0 failures),
   some with 18k–23k objects.
2. **`tools/model-viewer/level.html` + `level.js`** — loads a level JSON, reconstructs:
   - **Terrain**: fetches `<map>.tga`, takes the **alpha channel as height** (world Y =
     `alpha * 4.0`; TGA read top-down so row=Z/grid, col=X/grid), downsamples to ≤400²
     segments, builds a lit `BufferGeometry` surface. Falls back to a flat plane if the
     TGA is missing/mismatched.
   - **Objects**: resolves each placement's name candidates to a `.geo` via the model
     index, groups by model, and draws one `InstancedMesh` per LOD0 section (real
     textures via `materials.js`). World axes line up with terrain (no transform needed).
   - **Markers** (colored instanced spheres), **Paths** (line segments).
   - Camera auto-fits map bounds; layer toggles for terrain/objects/markers/paths/boxes.

## CBID → model resolution

The clonebase gives no direct `.geo` filename, so `level.js` resolves by convention:
try `Unique`, `Physics`, then `Short` (lowercased, and each with an `obj_` prefix) against
the model index's geo stems. Measured on `scrapvalley`: **~82% of placements resolve to an
exact `.geo`**; town maps like `citadel` hit ~100%. Unresolved placements (and any beyond
the `MAX_UNIQUE_MODELS=400` per-map cap) render as translucent boxes, counted in the info
panel. `Physics` is a **collision proxy** (`sphere`, `tree`), not always the visual mesh —
`Unique` is tried first for that reason.

### Known gaps / limits
- **Trees** are the main unresolved class: clonebase `Unique` names (e.g.
  `obj_mnt_n_snag_tree_01_pine-yellowish-dead`) don't exactly match the shipped geo stems
  (variant suffix differences). A fuzzy/prefix match could recover most, at the risk of
  wrong models — deliberately left as boxes for now. This is the obvious next improvement.
- **Editor placeholders** (triggers, some spawns) come through as objects with placeholder
  physics/unique names and box out harmlessly.
- **Per-map unique-model cap** (400) bounds load time on the largest maps; the rest box.
- **Terrain texturing**: the surface is a flat lit colour. The `.tga` also carries a
  drivable-zone mask (G) and tile index (B), and tilesets map to 8 blended texture layers
  (`CVOGTerrain_ApplyTilesetTextures`); wiring real terrain textures is future work.
- **Height resolution**: 8-bit alpha → ~4-unit vertical steps (recognizable, slightly
  terraced). See `docs/terrain-format-findings.md` for the decode + how to refine the scale.
- A stray 404 during load is a missing/renamed `.dds` for one material — non-fatal
  (that material falls back to a magenta placeholder).

## Validation

Headless-browser screenshots (all rendered correctly, inspected):
- `sec_f_b_map_hwy_a2_1_scrapvalley` (2048², 19.6k objects) — mountainous terrain with
  barrier walls/fences instanced along the valley road network, patrol paths, markers.
- `sec_f_m_map_town_e7_1_citadel` (512², 18.2k objects, 194/194 models) — walled city with
  dense buildings.
- `sec_f_b_map_interior_a1_1_fort-logan-tavern` (256², 113/113 models) — enclosed cave/tavern.
