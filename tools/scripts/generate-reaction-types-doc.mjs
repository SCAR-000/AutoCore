import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, 'tools/model-viewer/reaction-catalog.json'), 'utf8'),
);

const rows = catalog.types
  .map((t) => {
    const fields =
      Object.entries(t.fields ?? {})
        .map(([k, v]) => `${k}: ${v.label}`)
        .join('; ') || '—';
    const effects = (t.sideEffects ?? []).join(', ') || '—';
    return `| ${t.id} | ${t.name} | ${t.realm} | ${fields.replace(/\|/g, '/')} | ${effects} | ${t.ghidra?.handler ?? '-'} | ${t.implementationStatus} |`;
  })
  .join('\n');

const md = `# Reaction types

Map **reactions** are logic nodes referenced by trigger volumes (and chained from other reactions). Each reaction has a type byte (0–87) matching [\`ReactionType\`](../src/AutoCore.Game/Entities/Reaction.cs) and a binary layout in [\`ReactionTemplate\`](../src/AutoCore.Game/EntityTemplates/ReactionTemplate.cs).

This document is the human-readable companion to the machine-readable catalog at [\`tools/model-viewer/reaction-catalog.json\`](../tools/model-viewer/reaction-catalog.json). The level viewer, MapDump exporter, and server scaffold all consume that JSON.

## Execution flow

\`\`\`mermaid
flowchart LR
  Trigger[Trigger volume] --> Server[SectorMap.TriggerReactions]
  Server --> TIP[Reaction.TriggerIfPossible]
  TIP --> Registry[ReactionHandlerRegistry]
  Registry --> Packet[GroupReactionCallPacket / LogicStateChangePacket]
  Packet --> Client[autoassault.exe]
  Client --> Dispatch[CVOGReaction_Dispatch 0x0057c500]
\`\`\`

Retail embeds authoritative reaction handling in the client binary (\`autoassault.exe\`). AutoCore runs handlers on the sector server first, then notifies clients so the retail dispatch path can run UI-only effects.

**Realm** values in the catalog:

| Realm | Meaning |
|-------|---------|
| \`server\` | Authoritative state change on sector server (object lifecycle, variables, missions). |
| \`client\` | Presentation / UI only on the game client after the packet arrives. |
| \`server-then-client\` | Server mutates state, client shows feedback (rare; see per-type notes in JSON). |

## Ghidra anchors (AA-decode)

| Symbol | Address | Role |
|--------|---------|------|
| \`CVOGReaction_Dispatch\` | \`0x0057c500\` | Switch on reaction type 0–87 (\`VOGReaction.cpp\`) |
| Variable lookup | \`0x005b05f0\` | Read map variable by id |
| Variable set | \`0x005afbc0\` | Write map variable |
| Nested reaction fire | \`0x004cd3a0\` | Chain \`Reactions[]\` COIDs |

Regenerate the catalog after Ghidra updates: \`node tools/scripts/build-reaction-catalog.mjs\`.

## Worked examples

### Activate / Delete / Death (object lifecycle)

| Type | ID | Key fields | Behavior |
|------|----|------------|----------|
| Activate | 0 | \`Objects[]\` | Resolve each TFID; call activate vfunc; chain nested reactions. |
| Delete | 3 | \`Objects[]\` | Despawn via \`FUN_004db8b0\` (no loot). |
| Death | 8 | \`Objects[]\` | Death flag path on same helper; may grant loot. |

AutoCore Tier A handlers: \`SetLogicActive\`, \`LeaveMap\`, \`MarkDead\` + \`LeaveMap\`.

### Text (dialog)

| Field | Role |
|-------|------|
| \`Text.Main\` | Dialog body |
| \`Text.Choices[].TriggerCoid\` | **Trigger COID** (not a nested reaction) |
| \`Text.TargetType\` | \`Client\` vs \`Convoy\` audience |

MapDump exports \`LinkedTriggerCoids\` separately from \`NestedReactionCoids\`. The viewer drill-down links choice buttons to triggers.

### MarkRepairStation

| Field | Role |
|-------|------|
| \`GenericVar1\` | Repair station index bookmarked for INC airlift |

Handler: \`FUN_00521e00\`. AutoCore stores per-character station id on \`SectorMap\`.

### CompleteObjective / FailMission

| Field | Role |
|-------|------|
| \`GenericVar1\` | Mission id |
| \`ObjectiveIDCheck\` | Objective gate / index check |

Handlers: \`FUN_00533f90\` (complete), \`FUN_0052da30\` (fail, packet \`0x20B2\`). Server handlers currently log; full mission port pending.

### VariableSetRandom

| Field | Role |
|-------|------|
| \`GenericVar1\` | Target variable id |
| \`GenericVar2\` | Range minimum |
| \`GenericVar3\` | Range maximum |

Uses RNG table then \`FUN_005afbc0\`. AutoCore: \`MapVariableRuntime.SetRandom\`.

### TransferMap

| Field | Role |
|-------|------|
| \`MapTransfer\` | Transfer kind byte |
| \`MapTransferData\` | Payload id (continent / spawn) |

No \`Objects[]\` in file layout for this type. AutoCore handler is scaffolded (warp port pending).

### Unsupported in retail dispatch

\`MakeFriend\`, \`MakeEnemy\`, and \`ClientText\` appear in the enum and map files but fall through to the unknown-type path in \`CVOGReaction_Dispatch\`.

## Full type reference

| ID | Name | Realm | Field semantics | Side effects | Ghidra handler | AutoCore status |
|----|------|-------|-----------------|--------------|----------------|-----------------|
${rows}

## MapDump and viewer

- MapDump loads the catalog at export time (\`ReactionCatalog.cs\`) and bakes \`Semantics\` into precomputed trigger graphs.
- Re-run MapDump after catalog changes so \`tools/model-viewer/levels/*.json\` includes semantics:

\`\`\`
tools/AutoCore.MapDump/bin/Release/net8.0/mapdump.exe <game-dir> assets/extracted/maps tools/model-viewer/levels
\`\`\`

- Level viewer: reaction inspector drill-down, realm badges, and **View → Reaction types** reference panel read the same catalog via \`reaction-catalog.js\`.

## Server implementation

[\`ReactionHandlerRegistry\`](../src/AutoCore.Game/Reactions/ReactionHandlerRegistry.cs) registers Tier A handlers. \`Reaction.TriggerIfPossible\` delegates there. Status \`tier-a\` in the catalog means a handler exists (some mission/warp paths still log-only).

Map variable conditionals on triggers use \`MapVariableRuntime\` + \`TriggerConditional.Check\`.

## Tests

\`\`\`bash
node --test tools/model-viewer/reaction-catalog.test.js tools/model-viewer/reaction-execution.test.js tools/model-viewer/trigger-graph.test.js
dotnet test tools/AutoCore.MapDump.Tests/
dotnet test src/AutoCore.Game.Tests/
\`\`\`

## See also

- [Level renderer](level-renderer.md) — trigger inspector UX
- [\`ReactionTemplate\`](../src/AutoCore.Game/EntityTemplates/ReactionTemplate.cs) — binary layout
- [\`ReactionType\`](../src/AutoCore.Game/Entities/Reaction.cs) — C# enum
`;

const out = path.join(root, 'docs/reaction-types.md');
fs.writeFileSync(out, md);
console.log(`Wrote ${out} (${md.length} bytes)`);
