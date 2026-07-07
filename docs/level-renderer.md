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

For particle/VFX preview see [vfx-viewer.md](vfx-viewer.md) (`tools/model-viewer/vfx.html`).

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
     map-transfer fields, dialog text (`Text.Params` included), variable operands, optional
     `Semantics` (catalog summary, field labels, realm, Ghidra handler), etc.
   - `ObjectIndex`: COID → `{ Kind, Label, Pos, Cbid }` for cross-reference resolution.
   - `MapLogic`: map-level trigger COIDs (`PerPlayerLoadTrigger`, `OnKillTrigger`, …) and
     `Variables[]` (used to label conditional checks).
   - `Markers`: spawn / enter / store / outpost points (now include `Coid`).
   - `Paths`: map-path polylines (now include path `Coid`).
   - `Roads`: the `.fam` `RoadNodes` graph (`MapData.RoadNodes`) — `road`/`junction`/`river`
     nodes with `Pos`, `Tex` (profile/texture name), `Links` (node ids), and junction-only
     `Rotation`/`ArmPos`/`ArmDir`. See "Roads & rivers" below.
   Plus `levels-index.json` (map list + object/marker/trigger/reaction counts). All 104
   extracted maps parse (0 failures).
   Implementation: `LevelExporter`, `ReactionDescriber`, `TriggerGraphResolver`,
   `ReactionCatalog` under `tools/AutoCore.MapDump/` (tests in
   `tools/AutoCore.MapDump.Tests/`). Field semantics come from
   `tools/model-viewer/reaction-catalog.json` — see [reaction-types.md](reaction-types.md).
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
     textures via `materials.js`). Placements use raw JSON `Pos`/`Rot`; the whole
     `worldGroup` is reflected along Z (`scale.z = -1`) for Three.js handedness parity with
     `/play` — fly camera focus maps game Z → scene Z, materials forced `DoubleSide`.
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
     open a drill-down pane with full `Reactions[]` fields plus **catalog semantics**
     (description, per-field labels, Ghidra handler, implementation status badge) and a
     **Ghidra callees** block showing renamed symbol + decompiled signature per helper
     (`ghidra-functions.json`). The tree lists affected object names
     inline in each reaction summary; **focus buttons** for those objects appear only in the
     drill-down detail pane (not duplicated in the tree). Each node shows an **execution
     realm badge** (Server / Client UI / Server → all players / Server → convoy) from
     `reaction-catalog.json` via `reaction-execution.js` (heuristic fallback when catalog
     lacks `realm`). Focus buttons jump the camera to linked target COIDs via `ObjectIndex`; dialog
     choice buttons open linked **triggers** (`LinkedTriggerCoids`), not nested reactions. **View → Reaction types** opens a searchable catalog reference panel. Close the inspector with **×**. The bottom-left
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
     `tools/model-viewer/reaction-execution.js` and      `reaction-catalog.js` and `ghidra-functions.js` (Node tests:
     `node --test tools/model-viewer/ghidra-functions.test.js tools/model-viewer/reaction-catalog.test.js tools/model-viewer/reaction-execution.test.js tools/model-viewer/trigger-graph.test.js`).
   - **Hover/click inspection**: raycast against visible instanced meshes. Hover shows a
     follow-cursor tooltip; **click** pins the same details in a fixed panel (bottom-right)
     until another placement is clicked. Trigger wireframes explain green vs orange/yellow editor tints and the
     **activates-for** target type (Players, Vehicles, List, …). **Clicking a trigger**
     also opens the reaction inspector under the camera speed bar. `highlightMesh` marks the selected
     trigger or a focused COID target.
   - The dump also carries `Terrain.TileSet` (the map's `.fam` tileset byte,
     `MapData.TileSet`) — consumed by the terrain shader, see "Terrain texturing"
     below.

## CBID → model resolution

The clonebase gives no direct `.geo` filename. Resolution lives in
`tools/model-viewer/model-resolve.js` and is used by `level.js`:

1. Try `Unique`, then `Physics`, then `Short` (each expanded to hyphen/underscore variants
   and an `obj_` prefix).
2. Suffix aliases (`-dead` → `_dead`, `-stump` → `_stump`, etc.).
3. Controlled fuzzy match for `snag_tree` assets when only one stem matches.

Run `node tools/audit-level-resolution.js` for per-map unresolved/capped stats.
Measured globally after normalization: **~95%** of placements resolve (trees were the main
gap). Town/tutorial maps like `arkbaytutorial` hit **100%**. Unresolved placements (and any
beyond `MAX_UNIQUE_MODELS=800`) render as translucent boxes. `Physics` is a **collision
proxy** — `Unique` is tried first.

### Placement fidelity (MapDump → viewer)

Each `Object` in the level JSON now includes:

- `IsActive` — exported from the map file; **both `level.html` and `/play` render all
  placements** regardless of `IsActive` (editor/inactive props remain visible in the viewer).
- `TerrainOffset` — exported from the map file (terrain-fit metadata). **Do not add to
  `Pos[1]` for rendering** — `Location.Y` in the dump is already the final world Y.
  Verified on Ark Bay: adding `TerrainOffset` degrades median object–terrain fit and
  shifts ~4700 props vertically.
- `CloneScale` — multiplied with placement `Scale` and body-XOBB correction.
- `FxCreateExtraName` — exported for future VFX attachment (not rendered yet).

Object instancing lives in `tools/model-viewer/level-objects.js` (`buildInstancedObjects`);
shared with AutoAssault.web `/play`.

Re-run `mapdump.exe` after upgrading MapDump to populate these fields on existing JSON.

**Model root transform (2026-07-06).** Each `.geo` carries a per-model root transform in its
`NOBP`/`TADB` (phyBone) chunk — an `hkQsTransform` {rotation, translation, scale} — that
orients the raw vertices into the model's true (body-`XOBB`) frame. See
[geo-format.md → PBON](geo-format.md). `geo-parser.js` exposes it as `rootTransform`;
`applyRootTransform()` in `level-objects.js` bakes it into the vertices **when the result
matches the body XOBB** (a self-validating safety net — mis-located transforms are ignored),
and its scale then replaces `modelCorrection`. Without this, vehicle props render on their
side and tunnel doors sink ~half their height into the ground; buildings are mostly identity
and unaffected.

### Known gaps / limits
- **Trees** with ambiguous fuzzy matches still box out (unique-match-only policy).
- **Editor placeholders**: triggers use the dedicated trigger layer; unresolved models box.

## Trigger / reaction graph (Ghidra notes)

See [reaction-types.md](reaction-types.md) for the full 88-type catalog, field semantics, and server implementation status.

Trigger activation in retail `autoassault.exe` uses radius check against `Scale` (matches
`Trigger.CanTrigger` in `AutoCore.Game`). Reaction dispatch is centralized in
`VOGReaction.cpp` as **`CVOGReaction_Dispatch`** at **`0x0057c500`** — switch on reaction type byte 0–87. Map variable lookups
for conditionals and variable reactions use `FUN_005b05f0` (hash lookup by variable id);
therefore `TriggerConditional.LeftId` / `RightId` are **map variable ids**, resolved to
names via `MapLogic.Variables` in the viewer. The debug console string *"Shows when
variables are set/checked on conditionals"* confirms this interpretation.

Global TFIDs (`TargetList[].Global === true`) may reference objects outside the current
map — the viewer shows them as `global:#<coid>` without a focus button when no
`ObjectIndex` entry exists.
- **Per-map unique-model cap** (800) bounds load time on the largest maps; the rest box.
- A stray 404 during load is a missing/renamed `.dds` for one material — non-fatal
  (that material falls back to a magenta placeholder).

## Terrain texturing (IMPLEMENTED — game-accurate)

Fully reverse-engineered from `autoassault.exe` (Ghidra: `CVOGTerrain_BuildTileUVTable`
@ `0x5bedd0`, `CVOGTerrainChunk_BuildVertexBuffer` @ `0x5c01e0`) and
`assets/extracted/shaders/NDDiffTerrainLayered2.fx`. Implemented in
`tools/model-viewer/terrain-uv-table.js` (4096-entry UV LUT), `terrain-render.js`
(shared terrain mesh + tile-blend shader), and `level.js` / AutoAssault.web `/play`.

The renderer uses **per-pixel** tile blending in the fragment shader (world X/Z → tile
corners → atlas layers). This stays correct when the height mesh is decimated (each render
quad can span many tile cells). Solid-variant U offset is hashed per **tile cell** (not per
render quad) to avoid seams. The 4096-entry UV LUT in `terrain-uv-table.js` mirrors
`CVOGTerrain_BuildTileUVTable` for tests.

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
`uTint` uniform and sampled with `LinearFilter` so it interpolates smoothly (matching the
engine's per-vertex `VertColor`); this carries a lot of the authored look (streets, scorch,
garden plots are painted into it on town maps). `VertColor` in `NDTerrainLayered` is this
tint **and nothing else** — the final color is exactly `2 * uTint * light * blend`. There
is no separate per-vertex "verttint" texture multiply (an earlier `uVertTint`/`_verttint.png`
term was removed as it stamped a per-cell brightness grid not present in the game).

### Terrain lighting (environments)

The terrain shader lights each fragment exactly like the game's `NDDiffTerrainLayered2.fx`
(`PalLighting.fxh`): **one hemispheric light + one directional sun, no spec**:
`light = lerp(hemiBottom, hemiTop, 0.5*(N.y+1)) + saturate(dot(N,-sunDir))*sunColor`,
then `final = 2 * uTint * light * blend`. The real values come from the game's per-region
environment files `assets/extracted/data/env_<zone>[_<subarea>]_<tod>_nfx.xml` (parsed by
the env loader `FUN_004a18b0` @0x4a18b0): `hemiTopColor`, `hemiBottomColor`,
`directionalDifuse` (sun color), `directionalDirection` (sun vector), plus fog/sky.

`tools/build_env_lighting.py` extracts all of these into
`tools/model-viewer/env-lighting.json` (key = env name minus `_<tod>_nfx`, with a `tod`
map of dawn/midday/night/sunset). At load, `level.js` `resolveEnvKey()` picks the map's
zone env (preferring the zone-level entry) at **midday** by default; the **Lighting** panel
(region + time-of-day `<select>`s) switches it live. The game binds environments to
sub-area *regions* as you drive — that binding isn't in our exports, so a map defaults to
one representative region and the picker covers the rest. Maps with no shipped env (e.g.
interior missions like `titaniumfactory`) use a neutral default. Colors are converted
sRGB→linear; the env also drives the object fill lights and the background/horizon tint.

Not implemented (follow-ups): spec/glow layer pass, the game's far-LOD single-texture
path, automatic per-region env switching by camera position, and `play.html` still uses the
old 8-bit alpha height (switching it changes the physics collision surface — do that
deliberately).

## Sector decals (`sec_dec_*`, PalDiffMap)

Ground markings (white lines, trash, drains) use `PalDiffMap*.fx` with the shared
`sec_decals.dds` atlas. `materials.js` detects these effects and builds translucent
materials with polygon offset to reduce z-fighting on terrain. Models like
`sec_dec_white-line-fat.geo` resolve through the normal placement pipeline.

**Decal vs. surface routing (2026-07-06).** The `PalDiffMap*` family covers *both* flat
decals **and** opaque building surfaces (walls, pipes, ladders — `PalDiffMapNorMap`,
`PalDiffMapNorSpecGlossMapGlow`, `…EnvMap*`, ~500 sections in Ark Bay). The old
`isPalDiffMapEffect(effect)` routing sent them **all** to the decal material, which strips
specular/emissive and adds polygon offset — rendering large opaque walls as unlit black
panels pulled in front of the scene. Fix: route to the decal path only when the section is
actually decal-like (`AlphaTestEnable` or translucent `Phase`); opaque `PalDiffMap` sections
fall through to the standard surface material. `isPalDiffMapEffect` stays a family classifier
(its test is unchanged) — only the routing decision in `buildMaterial` changed.

**Self-illuminated glow (`NDGlow.fx`).** Light panels use bright `MatEmissive` (e.g. white
`[1,1,1]`) with **no** `GlowTexture` — the *diffuse* texture is the emissive source. The
standard path applied a flat white emissive over a dimly-lit texture, washing an orange panel
to pale pink. Fix: when `MatEmissive` is bright and there's a diffuse map but no glow texture,
drive `emissiveMap` from the diffuse map at full `MatEmissive` so the panel self-illuminates
in its own colour.

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
  last `_` (Ghidra: `CVOGRoadNode_ParseWidthFromTexName` @ `0x5e6c40`; default 10 when
  missing).
- **Junctions** additionally carry a **pad piece model** in `Tex`
  (e.g. `road_dirt-into-asphalt_t_40` → same-named `.geo`), a yaw `Rotation`, and
  6 `ArmPos`/`ArmDir` pairs — local arm attach points (rotate by `Rotation` around Y,
  add `Pos`), ordered parallel to `Links`, that road chains snap to.
- The road textures are square with the road running **along U**, so U advances by
  `distance / width` (square tiling); V spans the width.

`level.js` (`buildRoads`): walks the graph into chains between junctions/endpoints,
builds one Catmull-Rom ribbon mesh per chain (XZ-only path for roads; width from the
profile, ends snapped to the junction's matching arm), instanced junction pad `.geo`s at
`Pos`/`Rotation`, and river ribbons (translucent, 3D spline with authored node Y). Road
ribbons are **draped onto the decimated render terrain** via `current.terrainSampler`
(`renderTerrainY + small lift`) — authored node Y is not preserved when it exceeds the
visible mesh, which previously floated roads above ground. Rivers are *not* draped (water
sits below the banks). Toggle: the "roads" checkbox under World.

### Known gaps
- **End caps not placed**: terminal nodes (degree 1, e.g. `road_asphalt_end_10`,
  `road_asphalt_culdesac_10`) render as an open ribbon end — the dedicated end-cap/
  culdesac `.geo` pieces aren't instanced there yet.
- **Rivers can be partially hidden** where the decimated (≤400² segment) render terrain
  sits above the actual riverbed on wide/deep sections — the terrain mesh isn't cut out
  under water.
- Town maps (e.g. `citadel`) legitimately have **zero** road nodes — their streets are
  painted directly into the terrain tile/tint layers, not generated as ribbons.

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
