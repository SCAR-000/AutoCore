# Terrain Format — Findings

Reconstructing Auto Assault map terrain for a level renderer.
**Status: SOLVED — height, tile layers, tint and the full texturing pipeline are decoded
and implemented** (see `docs/level-renderer.md` "Terrain texturing" for the renderer side).

## TGA channel reference (per-map `<map>.tga`, 32bpp BGRA, at grid resolution) — FINAL

Decoded from `CVOGTerrain_LoadMapImage` @ `0x4aba80` (autoassault.exe, Ghidra project
AA-decode) and verified empirically:

- **Height is 16-bit: `h16 = (A << 8) | B`**, world Y = `h16 * HeightScale/256`
  (HeightScale = 4 from the `.fam`, so Y = h16/64, max ~1024 units).
  - A = high byte (this is why the early "height ≈ 4.0 × alpha" fit worked:
    median(Y/alpha) = 4.04 across 86 maps).
  - **B = low byte** (earlier misread as "tile/blend noise" — its high-frequency look is
    the fractional height). Verification on scrapvalley: using h16 keeps the mean height
    gradient identical (1.679 → 1.682) while flat zero-gradient runs drop 70% → 15%,
    i.e. it fills in the 8-bit terracing with genuine sub-4-unit relief.
- **G low 3 bits = per-cell tile layer index (0–7)** — selects the terrain texture layer
  (atlas row) for that cell (`CVOGTerrain_GetTileIndex` @ `0x4a8c00`, returns `G & 7`).
  G's high 5 bits are not used by the texturing path (earlier misread as a smooth "zone
  mask"). The tile grid is offset **(-1,-1)** from the height-vertex grid
  (`CVOGTerrainChunk_GetCornerData` @ `0x5bf480`).
- **R = unused** (0 in all checked maps).

Companion files per map (same directory, `assets/extracted/textures/`):
- `<map>_tint.tga` — same dimensions, per-cell RGBA **vertex tint**
  (`CVOGTerrain_LoadTintMap` @ `0x4ab100`; default mid-gray `0x7f7f7f`; shaders multiply
  by `2 * tint`, so 0x7f = neutral). Carries much of the authored ground look on town maps.
- `<map>_den.pgm` — lower-res density/detail map, not height.
- `_verttint.png` (`CVOGTerrain_ReloadRandomTintFile` @ `0x4a9c70`) — 8px-tall random
  per-vertex tint palette. Loaded by `level.js` when present (`uVertTint` uniform).

### Reconstruction recipe
1. `.fam` header → `width`, `height`, `gridSize`.
2. `<map>.tga` (top-down, **no row flip**): vertex
   `(col·gridSize, h16[row,col]/64, row·gridSize)`.
3. Texture per cell from the tileset atlas using `G & 7` corner indices — full
   algorithm (atlas layout, corner-mask LUTs, blend order) in `docs/level-renderer.md`.

## Terrain texturing pipeline (RE summary)

- `CVOGTerrain_ApplyTilesetTextures` @ `0x4a86f0` — tileset byte → per-tileset entry in
  the table at `0xaefb88` (34 entries, stride 0x15 dwords): label + 3 texture names
  (`tile`, `tile2`, `tile_*_spec`) + 8 layer indices (+ per-layer UV scale via the
  10-float table at `0xaefb60`, and 8 per-layer average colors). Extracted complete to
  `tools/model-viewer/tileset-table.json`. Only `tile2_*.dds` (diffuse atlas) and
  `tile_*_spec.dds` ship.
- `tile2_*.dds` = 2048² DXT5, **8×8 atlas of 256² cells: row = tile layer, column =
  transition pattern (0 corner / 1 edge / 2 three-corner / 3 diagonal / 4–7 solid
  variants); alpha = authored transition mask.**
- `CVOGTerrain_BuildTileUVTable` @ `0x5bedd0` — startup LUT (0xb45520): for each combo of
  4 corner tile indices, the 4 texture-stage UVs per corner. Corner-mask → column LUT
  `0xaf3fc8` = `[4,0,0,1,0,1,3,2,0,3,1,2,1,2,2,4]`, rotation LUT `0xaf4008` =
  `[0,0,3,3,1,0,1,0,2,0,2,3,1,1,2,0]` (90° cyclic UV rotation). Cell UV inset:
  `cell*0.125 + 0.0078125 + local*0.109375`.
- `CVOGTerrainChunk_BuildVertexBuffer` @ `0x5c01e0` — fills chunk VBs: Y from the u16
  height buffer, 4 UV sets from the combo LUT, vertex color from the tint map; random
  solid-variant column shift when a cell's 4 corners share one tile.
- Blend (shipped shader source `assets/extracted/shaders/NDDiffTerrainLayered2.fx`,
  `NDTerrainLayered` ps.1.1): lowest layer = solid base, higher layers lerped on top by
  atlas alpha in ascending order; `final = 2 * vertColor * lighting * blended`.

## Confirmed `.fam` binary header (per `CVOGTerrain::StreamMapHeader` @ `0x4aa0f0`)

Fields streamed in order:
`c_lMapVersion` (0x3e=62 current), `m_lMapIterationVersion`, `m_lWidth`, `m_lHeight`,
`m_fGridSize` (world units per cell), `m_ucTileSet`, `m_bUseRoad`, `m_arriMusic[3]`,
`m_bUseClouds`, `m_bUseTimeOfDay`, `m_strSkyboxName`, `m_fCullingScale`, `m_lNumberOfImports`.
Object field offsets: `+0x10` width, `+0x14` height, `+0x18` gridSize, `+0x1c` tileSet.

Verified against real files:
- `sec_f_b_map_interior_a1_1_fort-logan-tavern.fam`: ver=60, iter=709, w=256 h=256, grid=2.5
- `sec_f_b_map_hwy_a2_1_scrapvalley.fam`: ver=61, iter=2155, w=2048 h=2048, grid=5.0

The server's `MapData.cs` reads version + iterVersion then does `Position += 8` — that is
exactly `m_lWidth` + `m_lHeight` (2× int32), which it discards. Everything after (objects,
roads, etc.) it parses fully.

## Object placements — FULLY AVAILABLE

`MapData.Read` parses every VOGO/client-VOGO placement into `ObjectTemplate` subclasses with
real world transforms:
- `GraphicsObjectTemplate`: CBID, COID, **Location (Vector4)**, **Rotation (Quaternion)**, Scale,
  TerrainOffset, layer. Covers all buildings/props (`Object`, `ObjectGraphicsPhysics`, `QuestObject`).
- `SpawnPointTemplate`, `EnterPointTemplate`, `StoreTemplate`, `OutpostTemplate` — positioned markers.
- `MapPathTemplate` — road/patrol polylines (list of `MapPathPoint` positions).
- Plus `RoadNodes` (RoadNode/RoadNodeJunction/RiverNode) in `MapData.RoadNodes`.

CBID → model: `AssetManager.GetCloneBase(cbid)` gives `SimpleObjectSpecific.PhysicsName` +
`CloneBaseSpecific.UniqueName/ShortDesc`, resolvable to a `.geo` via the model-viewer index.
