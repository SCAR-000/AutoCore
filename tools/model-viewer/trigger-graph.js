/**
 * trigger-graph.js — resolve trigger→reaction graphs and build inspector HTML.
 * Mirrors AutoCore.MapDump TriggerGraphResolver / ReactionDescriber for old JSON dumps.
 */

import { inferReactionExecutionRealm, realmBadgeClass } from './reaction-execution.js';

const REACTION_OPS = {
  Activate: (r, idx) => `${r.ReactionType} ${formatTargets(r.Objects, idx)}`,
  Deactivate: (r, idx) => `${r.ReactionType} ${formatTargets(r.Objects, idx)}`,
  Create: (r, idx) => `${r.ReactionType} ${formatTargets(r.Objects, idx)}`,
  Delete: (r, idx) => `${r.ReactionType} ${formatTargets(r.Objects, idx)}`,
  TransferMap: (r) => `Transfer map (${r.MapTransfer || '?'}) data=${r.MapTransferData ?? '?'}`,
  Text: (r) => formatText(r),
  ClientText: (r) => formatText(r),
  OpenDialog: (r) => formatText(r),
  VariableSet: (r, idx, vars) => `${r.ReactionType} ${varName(r.GenericVar1, vars)} = ${r.GenericVar3 ?? r.GenericVar2}`,
  VariableAdd: (r, idx, vars) => `${r.ReactionType} ${varName(r.GenericVar1, vars)} += ${r.GenericVar3 ?? r.GenericVar2}`,
  VariableSub: (r, idx, vars) => `${r.ReactionType} ${varName(r.GenericVar1, vars)} -= ${r.GenericVar3 ?? r.GenericVar2}`,
};

function varName(id, variables) {
  const v = variables?.find((x) => x.Id === id);
  return v?.Name ? v.Name : `var:${id}`;
}

function formatTargets(coids, index) {
  if (!coids?.length) return '(no targets)';
  return coids.map((c) => formatCoid(c, index)).join(', ');
}

export function formatCoid(coid, index) {
  const entry = index?.[String(coid)];
  if (entry) return `${entry.Label || entry.Kind} (#${coid})`;
  return `#${coid}`;
}

function formatText(r) {
  const main = (r.Text?.Main || r.Name || '').replace(/\s+/g, ' ').slice(0, 120);
  const choices = r.Text?.Choices?.length || 0;
  return `${r.ReactionType}: "${main}"${choices ? ` (+${choices} choices)` : ''}`;
}

function getReactionCoids(trigger) {
  const raw = trigger?.Reactions ?? trigger?.reactions ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => Number(c)).filter((c) => Number.isFinite(c) && c > 0);
}

function getGraphNodes(trigger) {
  const graph = trigger?.Graph ?? trigger?.graph;
  if (!graph) return [];
  const nodes = graph.Nodes ?? graph.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

function buildReactionMap(reactions) {
  const map = new Map();
  for (const r of reactions || []) {
    const id = Number(r.Coid ?? r.coid);
    if (!Number.isFinite(id)) continue;
    map.set(id, r);
  }
  return map;
}

/** Resolve the full trigger record from a level dump (handles click hints / stale copies). */
export function lookupTrigger(data, hint) {
  if (!data || hint == null) return null;
  const coid = Number(typeof hint === 'object' ? hint.Coid : hint);
  if (!Number.isFinite(coid)) return null;

  if (typeof hint === 'object' && hint._triggerIndex != null && data.Triggers?.[hint._triggerIndex]) {
    const indexed = data.Triggers[hint._triggerIndex];
    if (Number(indexed.Coid) === coid) return indexed;
  }

  const fromList = data.Triggers?.find((t) => Number(t.Coid) === coid);
  if (fromList) return fromList;

  if (typeof hint === 'object') {
    if (getReactionCoids(hint).length || getGraphNodes(hint).length) return hint;
    if (hint.Type === 'Trigger') return hint;
  }
  return null;
}

/** Find a reaction record by COID in a level dump. */
export function lookupReaction(data, coid) {
  const id = Number(coid);
  if (!data?.Reactions || !Number.isFinite(id)) return null;
  return data.Reactions.find((r) => Number(r.Coid) === id) ?? null;
}

function summarizeReaction(r, index, variables) {
  const fn = REACTION_OPS[r.ReactionType];
  const summary = fn ? fn(r, index, variables) : (r.ReactionType || 'Unknown');
  const details = [];
  if (r.ActOnActivator) details.push('Acts on activator');
  if (r.DoForAllPlayers) details.push('For all players');
  if (r.DoForConvoy) details.push('For convoy');
  const nested = [...(r.Reactions || [])];
  if (r.Text?.Choices) {
    for (const ch of r.Text.Choices) {
      if (ch.TriggerCoid > 0) nested.push(ch.TriggerCoid);
    }
  }
  const targets = [...(r.Objects || [])];
  return { summary, details, nested, targets, reactionType: r.ReactionType, coid: r.Coid };
}

export function resolveTriggerGraph(trigger, data, maxDepth = 32) {
  const embedded = getGraphNodes(trigger);
  if (embedded.length > 0) return { Nodes: embedded };

  const coids = getReactionCoids(trigger);
  const byCoid = buildReactionMap(data?.Reactions);
  const index = data?.ObjectIndex || {};
  const variables = data?.MapLogic?.Variables || [];
  const nodes = [];

  for (const coid of coids) {
    const node = resolveNode(coid, byCoid, index, variables, new Set(), maxDepth, 0);
    if (node) nodes.push(node);
  }
  return { Nodes: nodes };
}

function resolveNode(coid, byCoid, index, variables, visited, maxDepth, depth) {
  const r = byCoid.get(Number(coid));
  if (!r) {
    return { Coid: coid, ReactionType: 'Missing', Summary: `Reaction #${coid} not found on map`, Details: [], TargetCoids: [], Children: [], IsCycle: false };
  }

  const { summary, details, nested, targets, reactionType } = summarizeReaction(r, index, variables);
  const node = { Coid: coid, ReactionType: reactionType, Summary: summary, Details: details, TargetCoids: targets, Children: [], IsCycle: false };

  if (visited.has(coid)) {
    node.IsCycle = true;
    node.Summary += ' (cycle)';
    return node;
  }
  if (depth >= maxDepth) {
    node.Summary += ' (max depth)';
    return node;
  }

  visited.add(coid);
  for (const nestedCoid of [...new Set(nested)]) {
    if (nestedCoid <= 0) continue;
    node.Children.push(resolveNode(nestedCoid, byCoid, index, variables, visited, maxDepth, depth + 1));
  }
  visited.delete(coid);
  return node;
}

function formatConditional(c, variables) {
  const left = varName(c.LeftId, variables);
  const right = varName(c.RightId, variables);
  return `${left} ${c.Type} ${right}`;
}

function buildTriggerHeaderHTML(trigger, data) {
  const variables = data.MapLogic?.Variables || [];
  const index = data.ObjectIndex || {};
  let html = `<div class="tp-header"><strong>${escapeHtml(trigger.Name || 'Trigger')}</strong></div>`;
  html += `<div class="tp-row"><span class="tp-k">COID</span> ${trigger.Coid} · CBID ${trigger.Cbid}</div>`;
  html += `<div class="tp-row"><span class="tp-k">Target</span> ${escapeHtml(trigger.TargetType || '?')}</div>`;
  html += `<div class="tp-row"><span class="tp-k">Radius</span> ${(trigger.Scale || 1).toFixed(1)}</div>`;
  if (trigger.ActivationCount) html += `<div class="tp-row"><span class="tp-k">Activations</span> ${trigger.ActivationCount}</div>`;
  if (trigger.Conditions?.length) {
    html += `<div class="tp-row"><span class="tp-k">Conditions</span> ${trigger.Conditions.map((c) => escapeHtml(formatConditional(c, variables))).join('; ')}</div>`;
  }
  if (trigger.TargetList?.length) {
    html += `<div class="tp-row"><span class="tp-k">Target list</span> ${trigger.TargetList.map((t) => t.Global ? `global:#${t.Coid}` : formatCoid(t.Coid, index)).join(', ')}</div>`;
  }
  return html;
}

function buildReactionTreeHTML(trigger, data, selectedReactionCoid = null) {
  const graph = resolveTriggerGraph(trigger, data);
  const reactionCoids = getReactionCoids(trigger);
  const index = data.ObjectIndex || {};
  let html = `<div class="tp-section">Reactions</div>`;
  if (graph.Nodes?.length) {
    html += `<ul class="tp-tree">${graph.Nodes.map((n) => renderNode(n, data, index, 0, selectedReactionCoid)).join('')}</ul>`;
  } else if (reactionCoids.length) {
    html += `<div class="tp-empty">Reaction COIDs ${reactionCoids.join(', ')} could not be resolved — re-run mapdump and hard-refresh.</div>`;
  } else if (!data.Triggers?.length && trigger.Type === 'Trigger') {
    html += `<div class="tp-empty">Stale level JSON (trigger placement only). Re-run mapdump to export reaction chains, then hard-refresh.</div>`;
  } else {
    html += `<div class="tp-empty">No reactions linked to this trigger.</div>`;
  }
  return html;
}

/** Trigger summary + interactive reaction tree for the overlay inspector. */
export function buildTriggerInspectorHTML(triggerHint, data, { selectedReactionCoid = null } = {}) {
  const trigger = lookupTrigger(data, triggerHint) ?? triggerHint;
  return buildTriggerHeaderHTML(trigger, data) + buildReactionTreeHTML(trigger, data, selectedReactionCoid);
}

/** @deprecated Use buildTriggerInspectorHTML — kept for tests. */
export function buildTriggerPanelHTML(triggerHint, data) {
  return buildTriggerInspectorHTML(triggerHint, data);
}

export function buildReactionDetailHTML(reactionCoid, data) {
  const reaction = lookupReaction(data, reactionCoid);
  if (!reaction) {
    return `<div class="tp-empty">Reaction #${reactionCoid} not found on this map.</div>`;
  }

  const index = data.ObjectIndex || {};
  const variables = data.MapLogic?.Variables || [];
  const { summary, details } = summarizeReaction(reaction, index, variables);
  const realm = inferReactionExecutionRealm(reaction);

  let html = `<div class="tp-detail-header"><span class="tp-type">${escapeHtml(reaction.ReactionType)}</span>`;
  html += `<span class="${realmBadgeClass(realm)}">${escapeHtml(realm.label)}</span></div>`;
  html += `<div class="tp-row tp-realm-hint">${escapeHtml(realm.hint)}</div>`;
  html += `<div class="tp-row"><span class="tp-k">COID</span> ${reaction.Coid} · CBID ${reaction.Cbid}</div>`;
  if (reaction.Name) html += `<div class="tp-row"><span class="tp-k">Name</span> ${escapeHtml(reaction.Name)}</div>`;
  if (!reaction.Objects?.length) {
    html += `<div class="tp-row"><span class="tp-k">Summary</span> ${escapeHtml(summary)}</div>`;
  }

  for (const d of details) html += `<div class="tp-detail">${escapeHtml(d)}</div>`;

  if (reaction.Objects?.length) {
    html += `<div class="tp-row"><span class="tp-k">Targets</span></div>`;
    html += `<div class="tp-targets">${reaction.Objects.map((c) => `<button type="button" class="tp-focus" data-coid="${c}">${escapeHtml(formatCoid(c, index))}</button>`).join(' ')}</div>`;
  }

  if (reaction.Reactions?.length) {
    html += `<div class="tp-row"><span class="tp-k">Nested</span> ${reaction.Reactions.map((c) => `#${c}`).join(', ')}</div>`;
  }

  if (reaction.ReactionType === 'TransferMap') {
    html += `<div class="tp-row"><span class="tp-k">Map</span> ${escapeHtml(reaction.MapTransfer || '?')} · data ${reaction.MapTransferData ?? '?'}</div>`;
  }

  if (reaction.GenericVar1 || reaction.GenericVar2 || reaction.GenericVar3) {
    const v1 = varName(reaction.GenericVar1, variables);
    html += `<div class="tp-row"><span class="tp-k">Vars</span> ${escapeHtml(v1)} · g2=${reaction.GenericVar2} · g3=${reaction.GenericVar3}</div>`;
  }

  if (reaction.ObjectiveIDCheck) {
    html += `<div class="tp-row"><span class="tp-k">Objective</span> ${reaction.ObjectiveIDCheck}</div>`;
  }

  if (reaction.Conditions?.length) {
    html += `<div class="tp-row"><span class="tp-k">Conditions</span> ${reaction.Conditions.map((c) => escapeHtml(formatConditional(c, variables))).join('; ')}</div>`;
  }

  if (reaction.Missions?.length) {
    html += `<div class="tp-row"><span class="tp-k">Missions</span> ${reaction.Missions.join(', ')}</div>`;
  }

  if (reaction.MiscText) {
    html += `<div class="tp-row"><span class="tp-k">Misc</span> ${escapeHtml(reaction.MiscText)}</div>`;
  }

  if (reaction.WaypointText) {
    html += `<div class="tp-row"><span class="tp-k">Waypoint</span> ${escapeHtml(reaction.WaypointType || '?')}: ${escapeHtml(reaction.WaypointText)}</div>`;
  }

  if (reaction.Text) {
    const t = reaction.Text;
    html += `<div class="tp-row"><span class="tp-k">Text</span> [${escapeHtml(t.Type)}] → ${escapeHtml(t.TargetType || '?')}</div>`;
    if (t.Main) html += `<div class="tp-detail tp-quote">"${escapeHtml(t.Main)}"</div>`;
    if (t.Choices?.length) {
      html += `<div class="tp-row"><span class="tp-k">Choices</span></div>`;
      html += `<ul class="tp-choice-list">${t.Choices.map((ch, i) => {
        const label = escapeHtml(ch.Text || `Choice ${i + 1}`);
        if (ch.TriggerCoid > 0) {
          return `<li><button type="button" class="tp-trigger-link" data-trigger-coid="${ch.TriggerCoid}">${label}</button> → trigger #${ch.TriggerCoid}</li>`;
        }
        return `<li>${label}</li>`;
      }).join('')}</ul>`;
    }
  }

  return html;
}

function renderNode(node, data, index, depth, selectedReactionCoid) {
  const reaction = lookupReaction(data, node.Coid);
  const realm = inferReactionExecutionRealm(reaction);
  const selected = Number(selectedReactionCoid) === Number(node.Coid);
  let html = `<li class="tp-node${node.IsCycle ? ' cycle' : ''}${selected ? ' selected' : ''}">`;
  html += `<button type="button" class="tp-node-select${selected ? ' selected' : ''}" data-reaction-coid="${node.Coid}">`;
  html += `<span class="tp-type">${escapeHtml(node.ReactionType)}</span>`;
  html += `<span class="${realmBadgeClass(realm)}">${escapeHtml(realm.label)}</span> `;
  html += `<span class="tp-summary">${escapeHtml(node.Summary)}</span>`;
  html += `</button>`;
  for (const d of node.Details || []) html += `<div class="tp-detail">${escapeHtml(d)}</div>`;
  if (node.Children?.length) {
    html += `<ul class="tp-tree">${node.Children.map((c) => renderNode(c, data, index, depth + 1, selectedReactionCoid)).join('')}</ul>`;
  }
  html += `</li>`;
  return html;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const TRIGGER_WIREFRAME_MATERIAL_RGB = 0xffa040;

export function triggerColor(trigger) {
  if (trigger.Color) {
    const c = trigger.Color >>> 0;
    // Map editor stores ARGB; take RGB bytes.
    return c & 0xffffff;
  }
  return TRIGGER_WIREFRAME_MATERIAL_RGB;
}

/** Instance color × orange base material (matches InstancedMesh in level.js). */
export function triggerEffectiveRenderRgb(trigger, materialRgb = TRIGGER_WIREFRAME_MATERIAL_RGB) {
  const instance = triggerColor(trigger) & 0xffffff;
  if (!trigger?.Color) return TRIGGER_WIREFRAME_MATERIAL_RGB;
  const ir = (instance >> 16) & 255;
  const ig = (instance >> 8) & 255;
  const ib = instance & 255;
  const mr = (materialRgb >> 16) & 255;
  const mg = (materialRgb >> 8) & 255;
  const mb = materialRgb & 255;
  const r = Math.round((ir * mr) / 255);
  const g = Math.round((ig * mg) / 255);
  const b = Math.round((ib * mb) / 255);
  return ((r << 16) | (g << 8) | b) >>> 0;
}

export function triggerWireframeCssColor(trigger) {
  const rgb = triggerEffectiveRenderRgb(trigger);
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

function isGreenishRender(rgb) {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  return g > 90 && g > r * 1.2 && g > b * 1.2;
}

function isWarmPlayerTint(rgb) {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  return r > 140 && g > 60 && b < 100;
}

/** Who can activate a trigger — mirrors AutoCore.Game TriggerTargetType / Trigger.CanTrigger. */
export const TRIGGER_TARGET_TYPE_INFO = {
  Players: {
    label: 'Players',
    description: 'Fires when your character or a vehicle you are driving enters the radius.',
  },
  Vehicles: {
    label: 'Vehicles',
    description: 'Fires when a vehicle enters — including empty or unoccupied vehicles.',
  },
  Creatures: {
    label: 'Creatures',
    description: 'Fires when an NPC creature enters the radius.',
  },
  MapEnemies: {
    label: 'Map enemies',
    description: 'Fires when map-spawned enemies enter the radius.',
  },
  List: {
    label: 'Target list',
    description: 'Fires only for specific objects on this trigger\'s target list (click for details).',
  },
  SummonTemplate: {
    label: 'Summon (template)',
    description: 'Fires for entities matching a summon template.',
  },
  SummonCBID: {
    label: 'Summon (CBID)',
    description: 'Fires for entities matching a clonebase ID.',
  },
};

export function triggerTargetTypeInfo(targetType) {
  return TRIGGER_TARGET_TYPE_INFO[targetType] ?? {
    label: targetType || 'Unknown',
    description: 'Unknown activator type.',
  };
}

/** Plain-language green vs orange/yellow wireframe explanation for hover tooltips. */
export function triggerWireframeColorNote(trigger) {
  const effective = triggerEffectiveRenderRgb(trigger);
  if (isGreenishRender(effective)) {
    return 'Green wireframe — non-player trigger (vehicles, target lists, or enemies).';
  }
  if (!trigger?.Color) {
    return 'Orange wireframe — default player walk-in zone (no editor tint set).';
  }
  if (isWarmPlayerTint(effective)) {
    return 'Orange/yellow wireframe — player walk-in zone on most maps (editor white/warm tints render orange via the base material).';
  }
  return `Custom wireframe tint — see activates-for below.`;
}

export function buildTriggerTooltipHTML(trigger) {
  const targetInfo = triggerTargetTypeInfo(trigger?.TargetType);
  const wire = triggerWireframeCssColor(trigger);
  const colorNote = triggerWireframeColorNote(trigger);
  let html = `<div class="tt-row tt-desc"><span class="tt-swatch" style="background:${wire}"></span> ${escapeHtml(colorNote)}</div>`;
  html += `<div class="tt-row">activates for: <span>${escapeHtml(targetInfo.label)}</span></div>`;
  html += `<div class="tt-row tt-desc">${escapeHtml(targetInfo.description)}</div>`;
  return html;
}

/** Collect triggers from new or legacy dump format. */
export function getTriggers(data) {
  if (data.Triggers?.length) return data.Triggers;
  return (data.Objects || []).filter((o) => o.Type === 'Trigger').map((o) => ({
    ...o,
    Name: o.Name || o.Unique || o.Short || 'Trigger',
    TargetType: o.TargetType || 'Unknown',
    Reactions: o.Reactions ?? o.reactions ?? [],
    Graph: o.Graph ?? o.graph,
  }));
}
