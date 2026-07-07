# VFX Viewer

Browse and preview Auto Assault particle effects (`*_nfx.xml`) in Three.js.

Effect definitions live under `assets/extracted/data/` as XML files using the
`NDSpecialFX` schema. Authoritative format notes are in
`assets/extracted/data/exampleScript_nfx.xml`.

## Run it

```bash
# 1. Extract retail assets (if not already done)
#    tools/AutoCore.AssetExtractor/ …

# 2. Build indexes (models/textures + VFX catalog)
python tools/build_viewer_index.py
python tools/build_vfx_index.py

# 3. Serve repo root and open the viewer
python -m http.server 8080
#   http://localhost:8080/tools/model-viewer/vfx.html
```

Deep-link an effect with `#<name>` (e.g. `vfx.html#CarExplosion01`).

## UI

Three columns:

| Column | Contents |
|--------|----------|
| Left | Filterable list of ~7,564 effects (search, category chips) |
| Middle | Metadata, texture IDs, parsed JSON, raw XML |
| Right | Three.js viewport with play/pause/restart, event selector, speed |

Related viewers: [Model viewer](geo-format.md) (static `.geo`), [Level viewer](level-renderer.md).

## NFX format (summary)

Each `*_nfx.xml` file contains one or more `<NDSpecialFX event="Create|Death|Hit|…">` blocks.
Inside each block:

- `<Particle type="Billboard|Kite|Beam|Fluid|…">` — sprite emitters with `<EmitterInfo>` and `<Keyframe>` tracks
- `<Trail>`, `<Lightning>`, `<Geometry>`, `<Sound>`, etc.

Keyframes interpolate `<ParticleInfo>` → `<ParticleInfoEnd` (color, alpha, scale, textureID) and
optional `<Ray>` / `<Circle>` motion.

## Particle texture atlas

Sprite `textureID` values index an **8×8 grid** (blocks **0–63**, **decimal**) on
`particles.dds` — `"16"` is block 16, not 0x16. The block runs left-to-right then
top-to-bottom. Optional suffix **A/B/C/D** selects a quadrant within the block:

| Suffix | Quadrant |
|--------|----------|
| A | upper-left |
| B | upper-right |
| C | lower-left |
| D | lower-right |

Implementation: `tools/model-viewer/particle-atlas.js`.

## Playback

The viewer simulates particle types with **CPU-expanded quads** (one draw pass for additive
“bright” sprites, one for alpha-blended sprites). Each quad samples the correct `particles.dds`
atlas cell from its `textureID`. Supported types and how they’re oriented:

| Type | Orientation |
|------|-------------|
| Billboard | camera-facing |
| Kite / CenterBeam / Beam | velocity-aligned (stretched by `scaleY`) |
| Decal | fixed surface plane (normal from `heading`) |
| Trail | camera-facing ribbon strip |
| Lightning | jagged bolt of ribbon segments (regenerated per `changeTime`) |

Particle **type** matching is case-insensitive, so data variants like `Centerbeam`/`billboard`
still render.

**Keyframe rule:** when a later `<ParticleInfo>` omits `textureID`, color, alpha, or scale, the
simulation **preserves the particle’s current values** (per `exampleScript_nfx.xml`). A particle
that never declares a texture is **skipped**, not forced to smoke — there is no `16` fallback.

Particles nested inside `<Geometry>` blocks are included — weapon **Fire** events preview correctly.

Preview event selection prefers the first event with playable systems: Create → Fire → Hit → Death → …

**Trail / Lightning caveats:** the preview has no owner body motion, so a **Trail** is laid out
as a static ribbon swatch along a fixed axis (showing its texture, colour gradient, taper and alpha
falloff). **Lightning** whose `target` is a runtime `P#` parameter uses a default bolt direction.

Blending approximates retail additive/alpha modes; it does not reproduce D3D9 shaders pixel-perfectly.
Effects that intentionally use smoke puffs (`textureID="16"`) still look round — that is correct.

Deferred (metadata only, no animation):

- Fluid (overloaded fields + separate `particle_fluid.dds`)
- RigidBody / Pursue missiles, vertex emitters, camera shake, Include resolution

Optional **geo companion** meshes (`sec_fx_*.geo` etc.) render as a faint reference mesh when enabled.

## Tooling

| File | Role |
|------|------|
| `tools/build_vfx_index.py` | Scan `*_nfx.xml` → `tools/model-viewer/vfx-index.json` |
| `tools/model-viewer/nfx-parser.js` | Parse NFX XML in browser/Node |
| `tools/model-viewer/particle-sim-lib.js` | Pure JS particle simulation |
| `tools/model-viewer/particle-atlas.js` | `textureID` → UV rects on `particles.dds` |
| `tools/model-viewer/vfx-renderer.js` | Three.js instanced billboard renderer |
| `tools/model-viewer/vfx.html` + `vfx.js` | Viewer UI |

Tests:

```bash
node --test tools/model-viewer/nfx-parser.test.js \
             tools/model-viewer/particle-atlas.test.js \
             tools/model-viewer/particle-sim-lib.test.js
```

## GeoParticle placeholders

Many map-placed effects (`sec_fx_smoke01.geo`, etc.) are small `.geo` stubs; the runtime loads
the matching `_nfx.xml` by basename. The index links `geoPath` when a same-stem `.geo` exists
(case-insensitive).
