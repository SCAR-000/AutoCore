# Auto Assault `.geo` Format (VOG / "palantir" engine)

Verified 2026-07-04 against the retail client `autoassault.exe` in Ghidra (project AA-decode)
and empirically against 2,500 randomly sampled extracted `.geo` files (7,335 sections — all
invariants below held; see exceptions where noted). Engine source paths appear in assert
strings: `C:\vog\1_code\palantir\palantir\graphics\*.cpp`.

Both `tools/geo_to_obj.py` and `tools/model-viewer/geo-parser.js` implement this spec.

## Container

All multi-byte values little-endian. A `.geo` file is a CHNK container:

| offset | size | value |
|---|---|---|
| 0 | 4 | magic `"CHNK"` |
| 4 | 4 | options: `'B'` binary, `'L'` little-endian, 2 pad bytes (`"BLXX"`). A text mode exists in the engine (`CHUNK "%s" %i` writer) but retail assets are all binary. |
| 8 | ... | root chunk `GBOD` (gfxBody) |

## Chunk header — uniform at every level (16 bytes)

Confirmed in `ChunkWriter::BeginChunk` (FUN_00767460): writes `{tag, size, version, reserved}`
then patches `size` at EndChunk.

| offset | type | field |
|---|---|---|
| +0 | u32 | tag (stored byte-reversed on disk: code constant `'VERT'` = file bytes `"TREV"`) |
| +4 | u32 | **body** size in bytes (excludes this 16-byte header) |
| +8 | u32 | version |
| +12 | u32 | reserved, always 0 (useful validation when scanning) |

Tags (file spelling → engine class): `DOBG`→GBOD gfxBody, `ECPG`→GPCE gfxGeometryPiece,
`TCFE`→EFCT effEffect, `MRAP`→PARM effect parameter, `RTSI`→ISTR string, `TREV`→VERT
gfxVertexBufferImpl, `XDNI`→INDX gfxIndexBufferImpl, `LCED`→DECL effVertexDecl,
`XOBB`→BBOX phyBoundingBox, `NOBP`→PBON phyBone, `TADB`→BDAT bone data, `ADSU`→USDA
user-data key/values. (`"LODL"` byte hits in files are the ASCII string `LODLevel`
inside GBOD/USDA bodies, NOT a chunk tag.)

Chunks have non-chunk fields between children, so a parser walks a parent's body with a
**bounded validated scan**: candidate tag in known set + `16+size` fits in parent body +
`version < 100` + `reserved == 0`.

## Tree shape

```
GBOD v3
├── (body fields: texture path table "C:\VOG\4_game\textures\*.dds", fx names,
│    LOD handler data w/ "LODLevel" strings — not needed; skip via child scan)
├── XOBB v2                    whole-body bounds
├── NOBP v1 ─ TADB v2          bones (skinned/attachment data; record, unused)
└── ECPG v10 × N               one per mesh section  (sections are SIBLINGS, never nested)
    ├── (1 byte: has-effect bool)
    ├── TCFE v3                material/effect
    │   ├── RTSI v1            .fx effect name, e.g. "NDHumanCar.fx"
    │   └── MRAP v2 × M        parameters (see PARM below)
    ├── XDNI v1|v2             index buffer
    ├── TREV v2|v3             vertex buffer
    ├── XOBB v2                section bounds
    └── (tail: bodyName\0 + 8 bytes + numStr\0 + pieceName\0 [+ "_LOD1"/"_LOD2" suffix]
         + ADSU v1 + 8 bytes)
```

**TREV↔XDNI pairing is by GPCE siblinghood** (exactly one of each per GPCE) — never by
file-order zip. The old converter's positional pairing happened to work only because both
appear in the same order.

## VERT (`TREV`) — gfxVertexBufferImpl, versions 1–3 accepted by client

v3 body (dominant; 7,318/7,335 sampled):

| offset | type | field |
|---|---|---|
| +0 | u32 | id/hash (ignore) |
| +4 | u16 | stride in bytes |
| +6 | u16 | vertex count (== count2; u16 legacy) |
| +8 | chunk | LCED (see DECL) |
| after LCED | u32 | count2 (authoritative) |
| ... | bytes | `count2 × stride` raw vertex data |

v2 body (older assets, e.g. `item_qst_flare-gun.geo`): LCED chunk directly at +0
(stride = sum of DECL element sizes), then `u32 count`, then data.

## DECL (`LCED`) v2 — effVertexDecl

Body: `u32 elementCount` + elementCount × 4-byte elements `{u8 type, u8 stream, u8 usage,
u8 usageIndex}`. Types/usages are **D3DDECLTYPE / D3DDECLUSAGE** values. Element offsets are
implicit: accumulate type sizes in element order (validated: sum == stride on all 263 buggy
chunks + full sample).

Type sizes (bytes): FLOAT1=4, FLOAT2=8, FLOAT3=12, FLOAT4=16, D3DCOLOR=4, UBYTE4=4,
SHORT2=4, SHORT4=8, UBYTE4N=4, SHORT2N=4, SHORT4N=8, USHORT2N=4, USHORT4N=8, UDEC3=4,
DEC3N=4, FLOAT16_2=4, FLOAT16_4=8.

Usages seen: 0=POSITION, 3=NORMAL, 5=TEXCOORD, 6=TANGENT (usageIndex 1 = binormal),
1=BLENDWEIGHT, 2=BLENDINDICES, 10=COLOR. Client v1 reader confirms usages {2,10} are
byte-typed, others float-typed.

Common layouts: stride 32 = pos+normal+uv; stride 56 = pos+normal+uv+tangent+tangent1;
stride 24 = pos+normal (untextured util meshes).

## INDX (`XDNI`) — gfxIndexBufferImpl, versions 1–2

v2 body:

| offset | type | field |
|---|---|---|
| +0 | u32 | id/hash (ignore) |
| +4 | u16 | index size: 2 or 4 |
| +6 | u16 | index count (legacy) |
| +8 | u32 | count2 (authoritative) |
| +12 | bytes | `count2 × indexSize` indices |

v1 body: `u32 count` + u16 indices immediately (index size always 2).

**Topology: triangle lists.** Every sampled chunk has count divisible by 3; no strip flag
exists in the chunk.

## EFCT (`TCFE`) v3 + PARM (`MRAP`) v2 + ISTR (`RTSI`) v1

- ISTR body: null-terminated ASCII string (size = strlen+1).
- EFCT body: ISTR (effect .fx name) + PARM children.
- PARM body: `name\0` + `u32 valueType` + value:

| type | value encoding |
|---|---|
| 1 | bool as u32 |
| 2 | int as u32 |
| 3 | float array: `u32 count` + count × f32 (count 1=scalar, 4=color/vec4, 16=4×4 matrix) |
| 4 | raw inline string `value\0` (e.g. `Phase` = "Translucent") |
| 5 | string as nested ISTR chunk |

Parameter names seen: `DiffuseTexture`, `NormalMapTexture`, `GlowTexture`, `TintTexture`,
`MatDiffuse`, `MatAmbient`, `MatSpecular`, `MatPower`, `MatEmissive`, `MatGlow`,
`MatColorPrimary`, `MatColorSecondary`, `MatColorTertiary`, `AlphaTestEnable`,
`UseRealAlpha`, `TexCoordTransform0` (4×4 UV matrix, near-always identity),
`TextureTransformFlags0`, `NormalMapTexCoord`, `GlowTexCoord`, `SpecPowerParams`,
`epsilon`, `Phase`.

Texture values are bare `.dds` basenames; resolve against extracted `textures/`.

## BBOX (`XOBB`) v2

Body (41 bytes): `u8 flag` + 10 × f32: `min[3], max[3], center[3], radius`.

## LODs

Each GPCE's trailing ADSU (USDA) chunk holds string key/value pairs:
`u32 pairCount` + pairs of `key\0value\0`. Key `LODLevel` = "0"/"1"/"2"... gives the piece's
LOD. Piece names also carry `_LOD1`/`_LOD2` suffixes. Files additionally ship separate LOD
variants (`*_l6/_l12/..._l78.geo` = LOD-at-distance exports). Default display = LODLevel 0
(pieces with no ADSU/LODLevel key are level 0).

## Materials → rendering (from extracted shader sources, `assets/extracted/shaders/`)

The `.fx` sources ship in the GLMs (mostly `effects.glm`) — e.g. `NDHumanCar.fx`,
`NDVehicleTint.sha`, `PalDiffMapNorSpecGlossMap*.fx`.

Vehicle paint (NDHumanCar.fx / NDVehicleTint.sha), authoritative:

```hlsl
float4 tint     = tex2D(TintMapSampler, uv);          // SAME uv as diffuse map
float3 combined = tint.r * MatColorPrimary.rgb
                + tint.b * MatColorSecondary.rgb;     // (+ tint.g * MatColorTertiary in some paths)
diffuse.rgb     = lerp(diffuse.rgb, combined, tint.a);
lighting        = (diffuseLight + ambient) * diffuse.rgb * 2;   // D3D9 modulate2x
```

Tint atlas = `<diffuse-stem>_NN_tint.dds` (NN = 01/02/03 paint schemes). Defaults when no
runtime colors: primary (0.23, 0.41, 0.22), secondary (0.25, 0.18, 0.13). Per-model defaults
come from the geo's `MatColorPrimary/Secondary` PARMs; per-vehicle runtime colors from the
clonebase (`VehicleSpecific.DefaultColors`).

`_bump.dds` = tangent-space normal map. `_i`/`_key` textures = glow/emissive
(`GlowTexture`). `lq_`/`mq_` texture-name prefixes = low/medium quality tiers of the same
basename.

## GLM archives (for completeness)

Parsed identically by `tools/AutoCore.AssetExtractor/GlmReader.cs` and the server's
`GLMLoader.cs`: footer u32 → CHNK header, options `'B','L'`, string table, 18-byte entries
`{offset, size, realSize, modifiedTime, scheme:i16, reserved}`. **Audit over the full retail
install (143,181 entries across 33 GLMs): every entry is `scheme=0`, stored uncompressed**
(`size == realSize`); the zlib path never triggers on retail data.
