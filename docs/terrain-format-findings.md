# Terrain Format — Findings

Reconstructing Auto Assault map terrain for a level renderer.
**Status: SOLVED enough to render terrain.** Object placement is fully available, AND the terrain
heightfield is decoded: it's the **alpha channel of the per-map `.tga`, height ≈ 4.0 × alpha**.

## TERRAIN HEIGHT — SOLVED

The per-map `<map>.tga` (32bpp BGRA, at exactly the `.fam` grid resolution) encodes terrain:
- **A (alpha) channel = height.** Decoded empirically: parsed the `EntryPoint` (player spawn
  world position, cleanly readable from the `.fam` header) for all maps; spawn elevation is the
  **Y** component (X/Z are the large horizontal coords, Y is small). Sampling the `.tga` at each
  spawn's grid cell `[Z/gridSize, X/gridSize]` (TGA is **top-down**, no row flip) gives:
  **median(Y / alpha) = 4.04 across 86 maps** (IQR 3.95–4.34; a tight 4-highway-map subset fit
  `height = 3.88·A + 2.5` with <2-unit error). So **worldHeight ≈ 4.0 × alphaByte**, offset ≈ 0.
- **B channel** = high-frequency tile/texture-index or blend noise (not height).
- **G channel** = a smooth drivable-zone / terrain-type mask (looked height-like but Y/G is
  scattered — NOT height).
- **R channel** = unused (always 0).

Resolution caveat: alpha is 8-bit → ~4-unit vertical steps, max ~1020 units. Good enough for
recognizable terrain; a finer low-order height byte (sub-4-unit residuals) may exist elsewhere
(unconfirmed — candidates: G, or the `_den.pgm`). Exact scale/offset can be pinned precisely later
by regressing many on-terrain object placements (not just spawn points, which sometimes sit on
structures — one outlier map spawns 1200 units up a tower) once the full `.fam` object parser
(the level renderer itself) provides multi-point ground truth.

### Terrain reconstruction recipe (for the renderer)
1. Read `.fam` header → `width`, `height`, `gridSize` (world units per cell).
2. Load `<map>.tga`, take the alpha channel as an `width × height` height grid.
3. Build a plane mesh: vertex `(col·gridSize, alpha[row,col]·4.0, row·gridSize)` for each cell
   (world X = col·grid, Z = row·grid, Y = height). Triangulate adjacent cells.
4. Texture/tint later using the G (zone) + B (tile) channels and the 8-layer tileset from
   `CVOGTerrain_ApplyTilesetTextures` if desired; a flat colour is fine to start.

## Confirmed `.fam` binary header

## What's confirmed

### `.fam` binary header (per `CVOGTerrain::StreamMapHeader` @ `0x004aa0f0`, VOGTerrain.cpp)
Fields streamed into the map object, in order:
`c_lMapVersion` (0x3e=62 current), `m_lMapIterationVersion`, `m_lWidth`, `m_lHeight`,
`m_fGridSize` (world units per cell), `m_ucTileSet`, `m_bUseRoad`, `m_arriMusic[3]`,
`m_bUseClouds`, `m_bUseTimeOfDay`, `m_strSkyboxName`, `m_fCullingScale`, `m_lNumberOfImports`.

Verified against real files:
- `sec_f_b_map_interior_a1_1_fort-logan-tavern.fam`: ver=60, iter=709, **w=256 h=256**, grid=2.5
- `sec_f_b_map_hwy_a2_1_scrapvalley.fam`: ver=61, iter=2155, **w=2048 h=2048**, grid=5.0

The server's `MapData.cs` reads version + iterVersion then does `Position += 8` — that 8 bytes
is exactly `m_lWidth` + `m_lHeight` (2× int32), which it discards. Everything after (objects,
roads, etc.) it parses fully.

### Object placements — FULLY AVAILABLE (this is 90% of "render the level")
`MapData.Read` parses every VOGO/client-VOGO placement into `ObjectTemplate` subclasses with
real world transforms:
- `GraphicsObjectTemplate`: CBID, COID, **Location (Vector4)**, **Rotation (Quaternion)**, Scale,
  TerrainOffset, layer. Covers all buildings/props (`Object`, `ObjectGraphicsPhysics`, `QuestObject`).
- `SpawnPointTemplate`, `EnterPointTemplate`, `StoreTemplate`, `OutpostTemplate` — positioned markers.
- `MapPathTemplate` — road/patrol polylines (list of `MapPathPoint` positions).
- Plus `RoadNodes` (RoadNode/RoadNodeJunction/RiverNode) in `MapData.RoadNodes`.

CBID → model: `AssetManager.GetCloneBase(cbid)` gives `SimpleObjectSpecific.PhysicsName` +
`CloneBaseSpecific.UniqueName/ShortDesc`, resolvable to a `.geo` via the model-viewer index.

**Conclusion: a renderer that places every building/prop/marker/road at its exact
position+rotation+scale is buildable right now, with no further RE.** Only the ground *surface*
is missing.

## TGA channel reference (per-map `<map>.tga`, 32bpp BGRA, at grid resolution)
- **A (alpha)** = terrain height (× ~4.0 world units). **Confirmed** — a hillshade of the alpha
  grid shows coherent ridges/valleys/drainage (see `scratchpad/terrain_alpha_hillshade.png`);
  scrapvalley height range 4–648 units, mean ~148.
- **B** = tile/texture index or blend noise (high-frequency).
- **G** = drivable-zone / terrain-type mask (smooth-quantized zones).
- **R** = unused.
Also `<map>_den.pgm` (lower-res PGM P5 8-bit) = a density/detail map, not height.

## Deeper RE pass (CVOGTerrain cluster @ 0x004a8000–0x004aa100, VOGTerrain.cpp)

Decompiled the terrain method cluster. What each does (renamed/commented in Ghidra):
- `0x004aa0f0` `CVOGTerrain::StreamMapHeader` — header only (fields listed above). Object field
  offsets: `+0x10` width, `+0x14` height, `+0x18` gridSize, `+0x1c` tileSet.
- `0x004a86f0` `CVOGTerrain::ApplyTilesetTextures` — maps `m_ucTileSet` → **8 texture layer
  indices** (object `+0x344..+0x360`) from a per-tileset table at `DAT_00aefb60`/`DAT_00aefb88`
  (stride 0x15). Confirms terrain is textured with 8 blended layers selected by tileset.
- `0x004a9c70` `CVOGTerrain::ReloadRandomTintFile` — loads a `_verttint.png` (must be **8px tall**),
  builds an 8-row random vertex-**tint** palette (writes the alpha byte `>>0x18` of each texel).
  This is per-vertex colour tint, **NOT height**.

So within this cluster there is **no height-array read** — the terrain height grid is loaded
elsewhere (map-load path) and only textured/tinted here. Height is therefore either (a) the smooth
channel of the per-map `.tga`, or (b) a coarser grid streamed in the `.fam` body the server skips.

## Strongest lead + the decisive experiment

The per-map `.tga` remains the only grid-resolution asset, and its **G channel is smooth
(adjacent-cell diff ~0.4)** — the statistical signature of a heightfield, not an index map. The
"stepped" look is consistent with genuinely terraced low-relief highway terrain.

**Decisive confirmation (do this next, uses only data in hand — no more guessing):**
Parse object placement world positions from a `.fam` (via the server's `MapData` parser or a port),
and for each object sample the `.tga` G value at its world-XY→grid-cell. If object elevation
correlates linearly with G, then **G = height** and the regression slope gives the **vertical
scale** (world units per G step); intercept gives the base. Use an outdoor map with real relief
(`scrapvalley`), not a flat interior. If G doesn't correlate, fall back to a **live read**: attach
to the running client and dump the terrain vertex buffer (the render path builds it via
`CVOGTerrainChunker::SubmitForRendering` @ `0x009d9e20`) to recover heights directly.

## Next RE steps (when tackling terrain height)
1. Find the terrain-grid stream: xref the `CVOGTerrain` vtable and functions that build
   `hkSampledHeightFieldBase`/`hkHeightFieldShape` (strings @ `0x00a0d5f0`/`0x00a0dc00`); the
   height array read happens right after `StreamMapHeader` in the map-load path.
2. Determine whether the grid is in the `.fam` body (a chunk `MapData.cs` currently skips) or a
   derived/decompressed buffer, and its element size (u8/u16) + vertical scale factor.
3. Cross-check decoded heights against `m_fGridSize` and known in-game landmark elevations.
