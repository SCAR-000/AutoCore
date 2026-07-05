# Level Renderer

Renders an entire Auto Assault map in three.js: terrain heightfield + every object
placement (instanced `.geo` models) + spawn/store/path markers. Built on the same
`.geo` parser and material system as the model viewer (`docs/geo-format.md`).

This terrain/placement pipeline (the `.tga`-alpha heightfield + per-map JSON) is
reused as-is by `tools/model-viewer/play.html`, the drivable vehicle physics demo
— see `docs/vehicle-physics-port.md` for that side (including how it uses the
same terrain as a *collision* surface, which required matching the decimation
exactly and switching to bilinear sampling).

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
     `alpha * 4.0`), downsamples to ≤400² segments, builds a lit `BufferGeometry` surface.
     Falls back to a flat plane if the TGA is missing/mismatched.
     **Orientation (verified):** grid row = `Z/gridSize`, col = `X/gridSize`, sampled in
     **raw file order with NO vertical flip** — even though the TGA descriptor is nominally
     bottom-up. Confirmed by regressing 19k real object positions against the alpha grid:
     raw `[Z,X]` puts objects within ~1.3 units of terrain; the bottom-up flip (and every
     other orientation) is off by ~30–38. Getting this wrong makes objects float/sink and
     the map look rotated relative to its props.
   - **Objects**: resolves each placement's name candidates to a `.geo` via the model
     index, groups by model, and draws one `InstancedMesh` per LOD0 section (real
     textures via `materials.js`). World axes line up with terrain (no transform needed).
     **Per-model scale correction:** ~10% of models are authored at an arbitrary local
     scale (e.g. `husk_police-car` visual geometry is 37× its true size). The **body-level
     XOBB** (first `XOBB`, a direct child of `DOBG`, before the sections) holds the true
     world bounds, so each model is scaled by `bodyXOBB_extent / visualGeometry_extent`
     (≈1.0 for the ~90% already correct; the shrink factor for the inflated ones). The
     per-section XOBB is inflated along with the geometry, so only the body-level one works.
     `geo-parser.js` returns this as `bodyBBox`.
   - **Markers** (colored instanced spheres), **Paths** (line segments).
   - Camera auto-fits map bounds; layer toggles for terrain/objects/markers/paths/boxes.
   - **Hover/click inspection**: a `THREE.Raycaster` against every visible
     `InstancedMesh` (objects, markers, boxes) reports the hovered instance —
     each instanced mesh's `userData.objs` array parallels its instance indices, so
     `intersectObjects` + `instanceId` looks straight back up the original placement
     record. A wireframe `highlightMesh` snaps to the hit instance's decomposed
     transform (position/quaternion, scaled to ~60% of its bounding size), and a
     tooltip (`buildTooltipHTML`) shows CBID/COID/position/rotation/scale/resolved
     model path for objects, or kind+position for markers. Hover is throttled to
     once per animation frame (`pendingHover` flag set on `mousemove`, consumed in
     the render loop) rather than raycasting on every mouse event.
   - The dump now also carries `Terrain.TileSet` (the map's `.fam` tileset byte,
     `MapData.TileSet`) — not yet consumed by the renderer, see "Terrain texturing"
     below.

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
- **Terrain texturing**: the surface is still a flat lit colour in the actual renderer
  (see "Terrain texturing" below for what's been extracted but not yet wired in).
- **Height resolution**: 8-bit alpha → ~4-unit vertical steps (recognizable, slightly
  terraced). See `docs/terrain-format-findings.md` for the decode + how to refine the scale.
- A stray 404 during load is a missing/renamed `.dds` for one material — non-fatal
  (that material falls back to a magenta placeholder).

## Terrain texturing (extracted, NOT wired in — has a known bug)

`CVOGTerrain_ApplyTilesetTextures` (Ghidra, `0x4a86f0`, see
`docs/terrain-format-findings.md`) maps a map's `TileSet` byte to **8 terrain
texture layers** via a table at `DAT_00aefb88` (stride 0x15 dwords: per entry, 8
layer indices into a texture-name array at `DAT_00aefb60`, each layer also carrying
a blend scale). This table was extracted into:

- `tools/model-viewer/tileset-table.json` — valid JSON, 34 tileset entries, each
  `{ label, tile, tile2, layerScales[4], layerIndices[4] }`.
- `tools/model-viewer/tileset-table.js` — an ES-module wrapper intended to
  `export default` the same data for direct `import` by `level.js`/`play.html`.

**`tileset-table.js` is currently broken and unused.** Its generator wrote a
*literal* two-character `\n` instead of an actual newline between the header
comment and `export default {`:
```
/** Auto-generated ... */\nexport default {
```
Outside of a string/comment, a bare `\` is not a valid JS token, so the file fails
to parse (`node -e "import('./tileset-table.js')"` → `Invalid or unexpected token`).
It is also **not imported anywhere** (`grep` finds zero references in any `.js`/
`.html` in `tools/model-viewer/`) — so this has no runtime impact today, but it
will throw the moment something tries to `import` it. Fix is a one-line
regeneration (replace the literal `\n` with a real newline, or just `export
default` the `.json` file's contents directly — the `.json` file is valid and is
the one to trust).

To actually texture terrain: resolve the current map's `TileSet` (now present in
the dump as `Terrain.TileSet`) against `tileset-table.json`, load the up-to-8
named `.dds` tiles via `materials.js`'s `TextureBank`, and blend them in a custom
terrain shader using the `.tga`'s G (zone) and B (tile-index) channels as blend
weights — the per-layer `layerScales` presumably control UV tiling density. None
of this blending logic has been written; only the lookup table exists.

## Validation

Headless-browser screenshots (all rendered correctly, inspected):
- `sec_f_b_map_hwy_a2_1_scrapvalley` (2048², 19.6k objects) — mountainous terrain with
  barrier walls/fences instanced along the valley road network, patrol paths, markers.
- `sec_f_m_map_town_e7_1_citadel` (512², 18.2k objects, 194/194 models) — walled city with
  dense buildings.
- `sec_f_b_map_interior_a1_1_fort-logan-tavern` (256², 113/113 models) — enclosed cave/tavern.
