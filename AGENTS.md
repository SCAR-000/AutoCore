# AGENTS.md

Repo-specific guidance for OpenCode sessions working in `AutoCore-SCAR`. Verified against the tree as of 2026-07-05.

## Solution layout

- `src/AutoCore.sln` is the only solution. Targets **.NET 8** (`net8.0`). No `global.json`, no `Directory.Build.props` — each `.csproj` is self-contained.
- Server projects (`src/AutoCore.*`):
  - `AutoCore.Auth`, `AutoCore.Global`, `AutoCore.Sector` — three independent console-hosted servers (Auth=login, Global=character/world, Sector=zone). Each has its own `Program.cs` and can run standalone.
  - `AutoCore.Launcher` — runs **all three servers in one process**. This is the default entrypoint for a running server: `dotnet run --project src/AutoCore.Launcher`.
  - `AutoCore.Communicator` — inter-server RPC packets, no executable.
  - `AutoCore.Database` — EF Core contexts (Auth/Char/World). MySQL via `Pomelo.EntityFrameworkCore.MySql` 5.0.2. **No migrations** — contexts initialize from connection strings set via `*Context.InitializeConnectionString(...)`.
  - `AutoCore.Game` — game logic, references `lib/TNL.NET` (networking) and `AutoCore.Database`.
  - `AutoCore.Utils` — logging, command processor, base `ExitableProgram`.
- `lib/TNL.NET` is a **git submodule** (`Blumster/TNL.NET`). After a fresh clone run `git submodule update --init`. It has its own `.sln` and `net8.0` target.
- `tools/` contains standalone .NET console tools (`AssetExtractor`, `EquipmentDump`, `MapDump`, `PhysicsDump`) plus the JS/HTML `model-viewer`. These are **not in `AutoCore.sln`** — build by csproj directly.
- `debug-tool/AutoCore.DebugTool` targets `net8.0-windows` (reads another process's memory via kernel32 P/Invoke). **Windows-only; won't restore on Linux/macOS.** Not in the solution either.

## Build / run

```bash
# Restore + build whole solution (run from repo root):
dotnet build src/AutoCore.sln

# Run the combined server (uses appsettings.{auth,global,sector}.json next to the exe):
dotnet run --project src/AutoCore.Launcher

# Run a single server in isolation (each is also Exe):
dotnet run --project src/AutoCore.Auth
dotnet run --project src/AutoCore.Global
dotnet run --project src/AutoCore.Sector

# Tools (not in .sln):
dotnet build tools/AutoCore.MapDump/AutoCore.MapDump.csproj
dotnet run --project tools/AutoCore.MapDump -- <gamePath> <mapsOutDir> <levelsOutDir>
```

## Tests

Two test frameworks coexist — check the csproj before assuming:

- `AutoCore.Utils.Tests` — **MSTest** (`Microsoft.NET.Test.Sdk` 16.9.4, `MSTest.TestAdapter` 2.2.3).
- `AutoCore.Game.Tests`, `AutoCore.MapDump.Tests`, `AutoCore.AssetExtractor.Tests` — **xUnit** 2.9.2.

```bash
dotnet test src/AutoCore.sln                       # all solution tests
dotnet test src/AutoCore.Utils.Tests               # one project
dotnet test src/AutoCore.Game.Tests --filter "FullyQualifiedName~MapVariableRuntimeTests"
```

`AutoCore.MapDump.Tests` and `AutoCore.AssetExtractor.Tests` are **not in the solution** — run by csproj. It links a fixture from `assets/extracted/maps/...` guarded by `Condition="Exists(...)"`, so it builds with or without extracted assets, but fixture-dependent tests only run when assets are present.

### JS tests (`tools/model-viewer/*.test.js`, `tools/*.test.mjs`)

Plain Node.js, no test runner dep, no `package.json`. Uses `node:test`:

```bash
node --test tools/model-viewer/              # all *.test.js
node --test tools/model-viewer/reaction-catalog.test.js
```

Files import via `node:` bare specifiers — needs **Node ≥ 18**. Don't add a `package.json` or convert to vitest/jest unless asked.

## Configuration & runtime prerequisites

- Each server loads `appsettings.<server>.json` then optionally `appsettings.<server>.env.json` (untracked override). To override secrets/paths locally, create the `.env.json` variant — do **not** edit the base file's connection strings back in.
- `appsettings.global.json` / `appsettings.sector.json` require a `GamePath` pointing at a **retail Auto Assault install** — `AssetManager.Initialize(GamePath)` and `MapManager` fail fast without it. The committed paths are author-local (`C:\Program Files (x86)\NetDevil\Auto Assault` and `X:\Projects\...`) — override via `appsettings.<server>.env.json`.
- MySQL must be reachable on `localhost:3306` with databases `autocore_auth`, `autocore_char`, `autocore_world`. Connection strings live in the appsettings files (currently hardcoded `root`/password). There are **no schema migrations** — DB schema is owned externally; `*Context` only reads/writes.
- `SectorServer` also opens a `DebugPort` (default 27099).

## Assets — not in git

`.gitignore` line `/assets` ignores the entire `assets/` tree (verified: `git check-ignore`). A fresh clone has **no extracted assets**. To populate:

- Run `tools/AutoCore.AssetExtractor` against a real Auto Assault install, or
- Drop extracted files under `assets/extracted/{maps,models,textures,data,scripts,...}`.

`AutoCore.Game`'s `AssetManager` and `AutoCore.MapDump` both expect `assets/extracted/` to exist at runtime. `tools/build_viewer_index.py` rebuilds `tools/model-viewer/index.json` from extracted assets.

### UI / interface assets

Retail HUD textures and layout XML use the **`i_` prefix** on the entry basename:

| Asset kind | Source GLM | Output path |
|------------|------------|-------------|
| UI DDS textures | `textures_base.glm` (+ a few in `misc.glm`) | `assets/extracted/textures/i_*.dds` |
| Interface layout XML | `interface.glm`, `scripts.glm` | `assets/extracted/data/i_*.xml` |

NPC mission/dialog chrome (used by AutoAssault.web `/play` MissionWindow):

- Root layout: `assets/extracted/data/i_d_npc.xml`
- Outer frame: `i_d_npc_2d_wnd_bg_texture.xml` → `i_g_2d_wnd_info_frame_thin.dds`
- Content frame: `i_d_npc_2d_wnd_frame_dialogue.xml` → `i_g_2d_wnd_frame_bevel_solid_light.dds`
- Response buttons: `i_d_npc_2d_btn_response.xml` → `i_d_npc_2d_btn_response_{up,down,off}.dds`

Extract UI only (without re-copying the full world tree):

```bash
dotnet build tools/AutoCore.AssetExtractor/AutoCore.AssetExtractor.csproj
dotnet run --project tools/AutoCore.AssetExtractor -- "<gamePath>" assets/ui --ui-only
dotnet test tools/AutoCore.AssetExtractor.Tests/AutoCore.AssetExtractor.Tests.csproj
```

Full extract still uses no filter. Filtered extracts (e.g. `assets/buggy` with `--filter "*dune-buggy*"`) omit all `i_*` UI files.

## Project quirks

- **`AutoCore.Game.csproj` excludes `Packets/Arena/**`** from `Compile`/`EmbeddedResource`/`None`. Adding files there will silently not build — use a different folder.
- **Nullable context is per-project**, not solution-wide: enabled in `Auth`, `Communicator`, `Game.Tests`, `Launcher`, and the `tools/*` projects; **disabled** in `Database`, `Global`, `Game`, `Sector`, `Utils`. Match the host project's setting when editing.
- **`ImplicitUsings` is enabled everywhere** — don't re-add `using System;` etc.
- Tool assembly names are lowercase (`mapdump`, `debugtool`, `assetextractor`, `equipmentdump`, `physicsdump`), not the csproj name. Outputs land in `bin/<Config>/net8.0/`.
- `AutoCore.MapDump` (and its tests) copy `tools/model-viewer/reaction-catalog.json` and `ghidra-functions.json` to the output dir as `Content`. If you rename/move those JSONs, update the `<Content Include>` links in both csprojs.
- TNL.NET namespace is `TNL` (no `.NET` suffix); `AllowUnsafeBlocks` is on for that project.

## RE / format docs

`docs/` holds reverse-engineering notes for the Auto Assault "VOG/palantir" engine — `.geo` mesh format, `.fam`/terrain pipeline, reaction types, vehicle physics. These docs are the **source of truth** for the C# parsers in `AutoCore.Game` and the JS parsers in `tools/model-viewer`; if behavior diverges, the docs win (they were verified against `autoassault.exe` in Ghidra). See `docs/TOC.md` for an index.

`tools/model-viewer/ghidra-functions.json` and `reaction-ghidra-worklist.json` are RE worklists derived from Ghidra — keep them in sync with `docs/reaction-types.md` when updating RE findings.

## Conventions

- No linter / formatter / codegen configured. No CI workflows. Verification = `dotnet build` + `dotnet test` + `node --test`.
- `.claude/settings.local.json` pre-approves `dotnet build|run|*` for Bash — assume dotnet CLI access is intended.
- Filenames in `src/AutoCore.Auth/Network/` use dot-separated partial-class suffixes (e.g. `AuthClient.Handlers.cs`, `AuthServer.Socketing.cs`) — follow that pattern when extending `AuthClient`/`AuthServer`.
- Don't commit `bin/`, `obj/`, `*.log`, or changes under `assets/` (the whole dir is ignored).

## Quick verification before sending a change

1. `dotnet build src/AutoCore.sln`
2. `dotnet test src/AutoCore.sln`
3. If you touched `tools/model-viewer/*.js` or `*.test.mjs`: `node --test tools/model-viewer/ tools/*.test.mjs`
4. If you touched `tools/AutoCore.MapDump`: also `dotnet build tools/AutoCore.MapDump.Tests/AutoCore.MapDump.Tests.csproj`
5. If you touched `tools/AutoCore.AssetExtractor`: also `dotnet test tools/AutoCore.AssetExtractor.Tests/AutoCore.AssetExtractor.Tests.csproj`


** MANDATORY ** 
Any and all work involving ghidra should ensure that the decompiled code is updated in the ghidra project, so as to ensure we do NOT do duplicate work.