#!/usr/bin/env node
/**
 * Regenerates AUTO sections in docs/arkgetaway.md from level JSON (+ arkbay-missions.json).
 *
 * Usage:
 *   node tools/scripts/generate-arkbay-doc.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEVEL_PATH = path.join(root, 'tools/model-viewer/levels/sec_f_h_map_tut_j2_arkbaytutorial.json');
const MISSIONS_PATH = path.join(root, 'tools/model-viewer/arkbay-missions.json');
const DOC_PATH = path.join(root, 'docs/arkgetaway.md');

const VAR_TYPE_NAMES = {
  0: 'scalar',
  1: 'cbid-count',
  3: 'player-level',
  7: 'health-percent',
  9: 'completed-mission',
  10: 'completed-objective',
  11: 'active-mission',
  12: 'active-objective',
};

export function loadLevel(levelPath = LEVEL_PATH) {
  return JSON.parse(fs.readFileSync(levelPath, 'utf8'));
}

export function loadMissions(missionsPath = MISSIONS_PATH) {
  if (!fs.existsSync(missionsPath)) return { ok: false, missions: [], objectives: [] };
  return JSON.parse(fs.readFileSync(missionsPath, 'utf8'));
}

export function triggerGroup(name) {
  if (name.startsWith('city_')) return 'city';
  if (name.startsWith('tsp_')) return 'tsp';
  return 'tutorial';
}

export function formatPos(pos) {
  if (!pos || pos.length < 3) return '—';
  return pos.map((n) => Number(n).toFixed(1)).join(', ');
}

export function formatConditions(conditions, varMap) {
  if (!conditions?.length) return '—';
  return conditions
    .map((c) => {
      const l = varMap[c.LeftId]?.Name ?? c.LeftId;
      const r = varMap[c.RightId]?.Name ?? c.RightId;
      return `${l} ${c.Type} ${r}`;
    })
    .join('; ');
}

export function formatReactionList(ids, rxMap) {
  if (!ids?.length) return '—';
  return ids
    .map((id) => {
      const r = rxMap[id];
      return r ? `R${id} \`${r.Name}\` (${r.ReactionType})` : `R${id} ?`;
    })
    .join('<br>');
}

export function formatReactionFields(r, index, varMap) {
  const parts = [];
  if (r.GenericVar1) {
    const v = varMap[r.GenericVar1];
    parts.push(`gv1=${v?.Name ? `${v.Name} (${r.GenericVar1})` : r.GenericVar1}`);
  }
  if (r.GenericVar2) parts.push(`gv2=${r.GenericVar2}`);
  if (r.GenericVar3) parts.push(`gv3=${r.GenericVar3}`);
  if (r.MapTransfer) parts.push(`transfer=${r.MapTransfer}:${r.MapTransferData}`);
  if (r.Objects?.length) {
    const labels = r.Objects.slice(0, 4).map((coid) => {
      const e = index[String(coid)];
      return e ? `#${coid} ${e.Label}` : `#${coid}`;
    });
    parts.push(`targets=${labels.join(', ')}${r.Objects.length > 4 ? '…' : ''}`);
  }
  if (r.Text?.Main) {
    const t = r.Text.Main.replace(/\[\$[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
    parts.push(`text="${t.length > 80 ? t.slice(0, 77) + '…' : t}"`);
  }
  if (r.Text?.Choices?.length) {
    parts.push(
      `choices=${r.Text.Choices.map((c) => `"${c.Text}"→T${c.TriggerCoid}`).join(', ')}`,
    );
  }
  return parts.join('; ') || '—';
}

export function buildMissionLookup(missionsData) {
  const byMissionId = new Map();
  const byObjectiveId = new Map();
  for (const m of missionsData.missions ?? []) {
    byMissionId.set(m.id, m);
    for (const o of m.objectives ?? []) {
      byObjectiveId.set(o.objectiveId, { ...o, missionId: m.id, missionTitle: m.title });
    }
  }
  for (const o of missionsData.objectives ?? []) {
    if (!byObjectiveId.has(o.objectiveId)) byObjectiveId.set(o.objectiveId, o);
  }
  return { byMissionId, byObjectiveId };
}

export function renderMissionIndex(level, missionsData) {
  const { byMissionId, byObjectiveId } = buildMissionLookup(missionsData);
  const rxMap = Object.fromEntries(level.Reactions.map((r) => [r.Coid, r]));
  const varMap = Object.fromEntries(level.MapLogic.Variables.map((v) => [v.Id, v]));

  const lines = [
    '### Mission reactions on this map',
    '',
    '| Reaction COID | Name | Type | ID | Resolved name |',
    '|---------------|------|------|-----|---------------|',
  ];

  const missionRxTypes = new Set(['GiveMission', 'FailMission', 'SetActiveObjective', 'CompleteObjective']);
  for (const r of level.Reactions.filter((x) => missionRxTypes.has(x.ReactionType)).sort((a, b) => a.Coid - b.Coid)) {
    const id = r.GenericVar1;
    let resolved = '—';
    if (r.ReactionType === 'GiveMission' || r.ReactionType === 'FailMission') {
      const m = byMissionId.get(id);
      resolved = m ? `${m.title} (\`${m.name}\`)` : `mission ${id}`;
    } else {
      const o = byObjectiveId.get(id);
      resolved = o ? `${o.title ?? o.objectiveName} (obj ${id})` : `objective ${id}`;
    }
    lines.push(`| ${r.Coid} | \`${r.Name}\` | ${r.ReactionType} | ${id} | ${resolved} |`);
  }

  lines.push('', '### Map variables referencing missions/objectives', '', '| Var ID | Name | Type | Ref ID | Resolved |', '|--------|------|------|--------|----------|');
  for (const v of level.MapLogic.Variables.filter((x) => x.Type >= 9 && x.Type <= 12).sort((a, b) => a.Id - b.Id)) {
    const refId = Math.round(v.Value);
    let resolved = '—';
    if (v.Type === 9 || v.Type === 11) {
      const m = byMissionId.get(refId);
      resolved = m ? m.title : `mission ${refId}`;
    } else {
      const o = byObjectiveId.get(refId);
      resolved = o ? (o.title ?? o.objectiveName) : `objective ${refId}`;
    }
    lines.push(`| ${v.Id} | \`${v.Name}\` | ${VAR_TYPE_NAMES[v.Type] ?? v.Type} | ${refId} | ${resolved} |`);
  }

  if (!missionsData.ok) {
    lines.push('', `_Mission names unavailable (${missionsData.error ?? 'missing arkbay-missions.json'})._`);
  }

  return lines.join('\n');
}

export function renderVariables(level) {
  const lines = [
    '| ID | Name | Type | Initial | Value | Notes |',
    '|----|------|------|---------|-------|-------|',
  ];
  for (const v of level.MapLogic.Variables.sort((a, b) => a.Id - b.Id)) {
    const type = VAR_TYPE_NAMES[v.Type] ?? `type-${v.Type}`;
    let notes = '';
    if (v.Type === 9 || v.Type === 11) notes = 'references mission id in Value';
    if (v.Type === 10 || v.Type === 12) notes = 'references objective id in Value';
    if (v.Name === 'l0_gunnyhealed') notes = 'exit gate — must be 1 for transit';
    lines.push(`| ${v.Id} | \`${v.Name}\` | ${type} | ${v.InitialValue} | ${v.Value} | ${notes || '—'} |`);
  }
  return lines.join('\n');
}

export function renderTriggers(level) {
  const varMap = Object.fromEntries(level.MapLogic.Variables.map((v) => [v.Id, v]));
  const rxMap = Object.fromEntries(level.Reactions.map((r) => [r.Coid, r]));
  const groups = { tutorial: [], city: [], tsp: [] };
  for (const t of level.Triggers.sort((a, b) => a.Coid - b.Coid)) {
    groups[triggerGroup(t.Name)].push(t);
  }

  const sections = [];
  for (const [label, key] of [
    ['Main tutorial (`l1_` / `L1_` / `L0_`)', 'tutorial'],
    ['City driving minigame (`city_`)', 'city'],
    ['Boost ramps (`tsp_`)', 'tsp'],
  ]) {
    sections.push(`### ${label} (${groups[key].length} triggers)`, '');
    sections.push(
      '| COID | Name | Position | Scale | Conditions | Reactions |',
      '|------|------|----------|-------|------------|-----------|',
    );
    for (const t of groups[key]) {
      sections.push(
        `| ${t.Coid} | \`${t.Name}\` | ${formatPos(t.Pos)} | ${t.Scale} | ${formatConditions(t.Conditions, varMap)} | ${formatReactionList(t.Reactions, rxMap)} |`,
      );
    }
    sections.push('');
  }
  return sections.join('\n');
}

export function renderReactions(level) {
  const varMap = Object.fromEntries(level.MapLogic.Variables.map((v) => [v.Id, v]));
  const index = level.ObjectIndex ?? {};
  const byType = new Map();
  for (const r of level.Reactions) {
    if (!byType.has(r.ReactionType)) byType.set(r.ReactionType, []);
    byType.get(r.ReactionType).push(r);
  }

  const sections = [];
  for (const type of [...byType.keys()].sort()) {
    const list = byType.get(type).sort((a, b) => a.Coid - b.Coid);
    sections.push(`### ${type} (${list.length})`, '');
    sections.push('| COID | Name | Fields |', '|------|------|--------|');
    for (const r of list) {
      sections.push(`| ${r.Coid} | \`${r.Name}\` | ${formatReactionFields(r, index, varMap)} |`);
    }
    sections.push('');
  }
  return sections.join('\n');
}

export function renderStats(level) {
  return [
    `- **Triggers:** ${level.Triggers.length}`,
    `- **Reactions:** ${level.Reactions.length}`,
    `- **Map variables:** ${level.MapLogic.Variables.length}`,
    `- **Paths:** ${level.Paths.length}`,
    `- **Markers:** ${level.Markers.length}`,
    `- **Objects (placements):** ${level.Objects.length}`,
  ].join('\n');
}

export function patchSection(doc, marker, content) {
  const start = `<!-- AUTO:${marker} -->`;
  const end = `<!-- /AUTO:${marker} -->`;
  const re = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!re.test(doc)) {
    throw new Error(`Missing AUTO marker ${marker} in ${DOC_PATH}`);
  }
  return doc.replace(re, `${start}\n${content}\n${end}`);
}

export function generate(options = {}) {
  const level = loadLevel(options.levelPath ?? LEVEL_PATH);
  const missionsData = loadMissions();

  const sections = {
    stats: renderStats(level),
    missions: renderMissionIndex(level, missionsData),
    variables: renderVariables(level),
    triggers: renderTriggers(level),
    reactions: renderReactions(level),
  };

  if (!fs.existsSync(DOC_PATH)) {
    return { level, sections, patched: false };
  }

  let doc = fs.readFileSync(DOC_PATH, 'utf8');
  for (const [key, content] of Object.entries(sections)) {
    doc = patchSection(doc, key, content);
  }
  fs.writeFileSync(DOC_PATH, doc);
  return { level, sections, patched: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { level, patched } = generate();
  console.log(
    `Level ${level.Name}: ${level.Triggers.length} triggers, ${level.Reactions.length} reactions, ${level.MapLogic.Variables.length} variables`,
  );
  if (patched) console.log(`Updated ${DOC_PATH}`);
  else console.log(`No doc at ${DOC_PATH} — sections returned only`);
}
