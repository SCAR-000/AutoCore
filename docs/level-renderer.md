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
   - `Objects`: every renderable `GraphicsObjectTemplate` placement (triggers are **not**
     duplicated here).
   - `Triggers`: full trigger volumes — name, COID, transform, `Scale` (radius), target
     type, flags, `Reactions[]` (reaction COIDs), `TargetList`, `Conditions`, and a
     precomputed `Graph` (recursive reaction tree with cycle detection).
   - `Reactions`: logic nodes — `ReactionType`, target object COIDs, nested reaction COIDs,
     map-transfer fields, dialog text, variable operands, etc.
   - `ObjectIndex`: COID → `{ Kind, Label, Pos, Cbid }` for cross-reference resolution.
   - `MapLogic`: map-level trigger COIDs (`PerPlayerLoadTrigger`, `OnKillTrigger`, …) and
     `Variables[]` (used to label conditional checks).
   - `Markers`: spawn / enter / store / outpost points (now include `Coid`).
   - `Paths`: map-path polylines (now include path `Coid`).
   Plus `levels-index.json` (map list + object/marker/trigger/reaction counts). All 104
   extracted maps parse (0 failures).
   Implementation: `LevelExporter`, `ReactionDescriber`, `TriggerGraphResolver` under
   `tools/AutoCore.MapDump/` (tests in `tools/AutoCore.MapDump.Tests/`).
2. **`tools/model-viewer/level.html` + `level.js`** — loads a level JSON, reconstructs:
   - **Terrain**: fetches `<map>.tga`, decodes the **16-bit height** (world Y =
     `((A<<8)|B) * HeightScale/256`, i.e. h16/64 — smooth, no terracing), downsamples to
     ≤400² segments, builds a `BufferGeometry` surface textured by the game-accurate
     tile-blending shader (see "Terrain texturing" below).
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
   - **Triggers**: wireframe spheres in `layers.triggers`, sized to `Scale` (radius),
     colored from the editor `Color` field when present. Toggle via **Objects → triggers**.
     **Click a trigger** to open a closeable **reaction inspector** overlay stacked under
     the **Camera speed** bar (top-left). It shows the full recursive reaction chain
     (precomputed in the dump; HTML is rebuilt on each open/selection so badges and drill-down
     stay in sync). Client-side fallback resolution lives in `trigger-graph.js`. Click hints
     only carry placement metadata + `_triggerIndex`. **Click a reaction node** in the tree to
     open a drill-down pane with full `Reactions[]` fields. Each node shows an **execution
     realm badge** (Server / Client UI / Server → all players / Server → convoy) inferred by
     `reaction-execution.js` from reaction type and flags — map files have no explicit realm
     field. Focus buttons jump the camera to linked target COIDs via `ObjectIndex`; dialog
     choice buttons open linked triggers. Close the inspector with **×**. The bottom-left
     info overlay shows trigger and reaction counts when the dump includes them — if reactions
     reads 0, re-run mapdump and hard-refresh. Wireframe tooltip colors use **effective render
     color** (editor tint × orange base material); white editor tints display as orange.
     Overlapping trigger picks prefer the **smallest radius** (innermost), tie-breaking later
     dump order. A collapsible **trigger list** rail on the right (View → trigger list) lists
     every trigger with filter/search; click an entry to fly to it and open the inspector.
     Collapse the rail header (▸) to shrink it to a narrow tab at the screen edge and reclaim
     canvas width; expand (▾) for the full scrollable list.
   - Camera auto-fits map bounds; collapsible **View** panel with grouped visibility toggles:
     - **World**: terrain, grid overlay. Fly camera is always active (WASD move, Q/E or Space
       up/down, Shift boost, left-drag look). **Camera speed** slider at the top-left of the
       viewport adjusts movement speed from a minimum up to the map's default speed (set
       automatically from map size on load — that default is the slider maximum). Press **F**
       to focus the camera on the selected trigger or highlighted COID target
       (`fly-controls.js`).
     - **Objects**: master + resolved models, physics props (`ObjectGraphicsPhysics`),
       graphics-only (`Object`), triggers (independent), unresolved placeholders (purple
       boxes), parse-failed (red boxes)
     - **Markers**: master + per-kind (spawn / enter / store / outpost)
     - **Lines**: paths
     Classification helpers live in `tools/model-viewer/level-visibility.js` and
     `tools/model-viewer/reaction-execution.js` (Node tests:
     `node --test tools/model-viewer/reaction-execution.test.js tools/model-viewer/trigger-graph.test.js`).
   - **Hover/click inspection**: raycast against visible instanced meshes. Hover shows a
     tooltip; trigger wireframes explain green vs orange/yellow editor tints and the
     **activates-for** target type (Players, Vehicles, List, …). **Clicking a trigger**
     opens the reaction inspector under the camera speed bar. `highlightMesh` marks the selected
     trigger or a focused COID target.
   - The dump also carries `Terrain.TileSet` (the map's `.fam` tileset byte,
     `MapData.TileSet`) — consumed by the terrain shader, see "Terrain texturing"
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
- **Editor placeholders**: triggers are no longer boxed — they use the dedicated trigger
  layer. Other unresolved placeholders (e.g. trees with mismatched geo names) still box out.

## Trigger / reaction graph (Ghidra notes)

Trigger activation in retail `autoassault.exe` uses radius check against `Scale` (matches
`Trigger.CanTrigger` in `AutoCore.Game`). Reaction dispatch is centralized in
`VOGReaction.cpp` (`FUN_0057c500` — switch on reaction type byte). Map variable lookups
for conditionals and variable reactions use `FUN_005b05f0` (hash lookup by variable id);
therefore `TriggerConditional.LeftId` / `RightId` are **map variable ids**, resolved to
names via `MapLogic.Variables` in the viewer. The debug console string *"Shows when
variables are set/checked on conditionals"* confirms this interpretation.

Global TFIDs (`TargetList[].Global === true`) may reference objects outside the current
map — the viewer shows them as `global:#<coid>` without a focus button when no
`ObjectIndex` entry exists.
- **Per-map unique-model cap** (400) bounds load time on the largest maps; the rest box.
- A stray 404 during load is a missing/renamed `.dds` for one material — non-fatal
  (that material falls back to a magenta placeholder).

## Terrain texturing (IMPLEMENTED — game-accurate)

Fully reverse-engineered from `autoassault.exe` (all functions renamed + plate-commented
in the Ghidra project) and the shipped shader source
`assets/extracted/shaders/NDDiffTerrainLayered2.fx`. Implemented in `level.js`
(`buildTerrainMaterial`, `TERRAIN_FRAG`).

### Map TGA channels (32bpp BGRA, `assets/extracted/textures/<map>.tga`)

- **Height is 16-bit**: `h16 = (A<<8) | B`, world Y = `h16 * HeightScale/256`
  (HeightScale = 4 → Y = h16/64). B is the height **low byte**, not noise —
  `CVOGTerrain_LoadMapImage` (0x4aba80) packs `(alphaPlane<<8)|B` into a u16 buffer and
  `CVOGTerrainChunk_BuildVertexBuffer` (0x5c01e0) does `vertexY = u16 * heightScale`.
  Verified empirically: adding B/64 keeps the mean height gradient identical
  (1.679 → 1.682 on scrapvalley) while zero-gradient cells drop 70% → 15% — i.e. it
  fills in the old 4-unit terracing with real fractional height.
- **G & 7 = per-cell tile layer index** (0–7), the atlas row
  (`CVOGTerrain_GetTileIndex` 0x4a8c00). G's high 5 bits are unused for texturing.
- R = unused (0 in all checked maps).
- The tile/tint grid is offset **(-1, -1)** from the height-vertex grid
  (`CVOGTerrainChunk_GetCornerData` 0x5bf480 fetches tile/color at `(x-1, y-1)`).

### Tileset → atlas

`Terrain.TileSet` → `tools/model-viewer/tileset-table.json` (regenerated, now complete:
per entry `label`, `tile`, `tile2`, `tileSpec`, `layerIndices[8]`, `layerScales[8]`,
`layerColors[8]`; source = table at `0xaefb88`, stride 0x15 dwords, in
`CVOGTerrain_ApplyTilesetTextures` 0x4a86f0). Only two textures actually ship per
tileset: **`tile2_*.dds` (the diffuse atlas the renderer uses)** and `tile_*_spec.dds`
(spec/glow, unused here). `layerScales` (UV densities from the 10-float table at
`0xaefb60`) and `layerColors` (per-layer average colors) are only used by the game's
far-LOD path — not needed for per-cell rendering.

The atlas is 2048² DXT5 = **8×8 grid of 256² cells**: **row = tile layer index (0–7),
column = transition pattern** — 0 = one corner, 1 = edge, 2 = three corners,
3 = diagonal, 4–7 = solid variants. The **alpha channel is the authored transition
mask** used for blending.

### Per-cell blending (`CVOGTerrain_BuildTileUVTable` 0x5bedd0 + NDTerrainLayered ps.1.1)

For each terrain cell, take the 4 corner tile indices (corners A = cell min,
B = +x, C = +z, D = +xz):

1. **Lowest index = solid base** (column 4; if all 4 corners equal, a random 0–3
   column shift picks a solid variant — the viewer hashes the cell coords).
2. Each higher distinct index blends on top **in ascending order**: corner-equal mask
   (bits A=1, C=2, B=4, D=8) → column LUT `[4,0,0,1,0,1,3,2,0,3,1,2,1,2,2,4]` and
   rotation LUT `[0,0,3,3,1,0,1,0,2,0,2,3,1,1,2,0]`; rotation r samples the pattern art
   at `Ra^r(f)`, `Ra(x,y) = (y, 1-x)` (verified against the LUT + atlas alpha art).
3. Atlas UV = `cell*0.125 + 0.0078125 + local*0.109375` (2-texel inset against bleed).
4. `color = base; for each layer L: color = mix(color, L.rgb, L.a)` then
   `final = 2 * vertexColor * lighting * color` (the ×2 is the engine convention —
   neutral tint is 0x7f mid-gray).

### Vertex tint

`<map>_tint.tga` (ships beside the map TGA, same dimensions) = per-cell RGBA vertex
color (`CVOGTerrain_LoadTintMap` 0x4ab100; default `0x7f7f7f`). Loaded async into the
`uTint` uniform; this carries a lot of the authored look (streets, scorch, garden plots
are painted into it on town maps).

Not implemented (follow-ups): spec/glow layer pass, the game's far-LOD single-texture
path, and `play.html` still uses the old 8-bit alpha height (switching it changes the
physics collision surface — do that deliberately).

## Roads & rivers (RoadNodes)

The `.fam` `RoadNodes` graph (parsed by the server's `MapData`, now exported by MapDump
as `Roads` in the level JSON) is what the game turns into drivable road geometry at map
load (it also caches the result in `..\maps\roadcache\`, which does not ship — so the
viewer regenerates ribbons the same way).

- **Node kinds**: `road` (chain point, 2 links), `junction` (up to 6 links, -1 = unused),
  `river`. `Links` are node UniqueIds.
- **`Tex`** = profile name, e.g. `road_2laneasphalt_20`: it is **both** the `.dds`
  texture stem (only `mq_`/`lq_` tiers ship — `TextureBank`'s prefix fallback resolves
  them) **and** the width source: the trailing `_NN` is parsed with `atof` after the
  last `_` (`CVOGRoadNode.cpp`, fn @ `0x5e6c40`; default 10 when missing).
- **Junctions** additionally carry a **pad piece model** in `Tex`
  (e.g. `road_dirt-into-asphalt_t_40` → same-named `.geo`), a yaw `Rotation`, and
  6 `ArmPos`/`ArmDir` pairs — local arm attach points (rotate by `Rotation` around Y,
  add `Pos`), ordered parallel to `Links`, that road chains snap to.
- The road textures are square with the road running **along U**, so U advances by
  `distance / width` (square tiling); V spans the width.

`level.js` (`buildRoads`): walks the graph into chains between junctions/endpoints,
builds one Catmull-Rom ribbon mesh per chain (width from the profile, ends snapped to
the junction's matching arm), instanced junction pad `.geo`s at `Pos`/`Rotation`, and
river ribbons (translucent). Road ribbons are **draped onto the decimated render
terrain** via `current.terrainSampler` (`max(nodeY, renderTerrainY) + lift`) — node
heights are exact but the ≤400² render mesh deviates by several units on 2048² maps and
would otherwise bury them. Rivers are *not* draped (water sits below the banks).
Toggle: the "roads" checkbox under World.

## Invisible physics proxies

`invis_*` models (e.g. `invis_physics_10x05rect`) are editor-only collision volumes:
their material is `PalDiffMap.fx` with `Phase = Translucent` and the editor's purple
`MatDiffuse` — retail never draws them, but a naive material renders them as giant
opaque slabs that wall off every highway map. The viewer ghosts any model whose geo
basename starts with `invis` (opacity 0.08, no depth write) so they stay inspectable.

## Validation

Headless-browser screenshots (all rendered correctly, inspected):
- `sec_f_b_map_hwy_a2_1_scrapvalley` (2048², 19.6k objects) — mountainous terrain with
  barrier walls/fences instanced along the valley road network, patrol paths, markers.
- `sec_f_m_map_town_e7_1_citadel` (512², 18.2k objects, 194/194 models) — walled city with
  dense buildings.
- `sec_f_b_map_interior_a1_1_fort-logan-tavern` (256², 113/113 models) — enclosed cave/tavern.
