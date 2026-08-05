/**
 * Reaction type semantics catalog (from Ghidra RE of CVOGReaction_Dispatch).
 * Source JSON: reaction-catalog.json (regenerate via tools/scripts/build-reaction-catalog.mjs).
 */

import catalogData from './reaction-catalog.json' with { type: 'json' };
import { resolveGhidraCallees, formatGhidraCallee } from './ghidra-functions.js';

/** @typedef {{ role: string, label: string, optional?: boolean }} FieldRole */
/** @typedef {{ id: number, name: string, realm?: string, summary?: string, description?: string, fields?: Record<string, FieldRole>, sideEffects?: string[], nestedReactions?: boolean, linkedTriggers?: boolean, confidence?: string, implementationStatus?: string, ghidra?: object, clientUiOpcode?: number, packets?: string[], callees?: string[] }} ReactionTypeInfo */

/** @type {Map<string, ReactionTypeInfo>} */
const byName = new Map(catalogData.types.map((t) => [t.name, t]));

/** @type {Map<number, ReactionTypeInfo>} */
const byId = new Map(catalogData.types.map((t) => [t.id, t]));

export const REACTION_CATALOG_VERSION = catalogData.version;
export const REACTION_CATALOG_GHIDRA = catalogData.ghidra;
export const REACTION_TYPE_COUNT = catalogData.types.length;

/** @returns {ReactionTypeInfo[]} */
export function getAllReactionTypes() {
  return catalogData.types;
}

/**
 * @param {string|number|null|undefined} nameOrId
 * @returns {ReactionTypeInfo|null}
 */
export function getReactionTypeInfo(nameOrId) {
  if (nameOrId == null || nameOrId === '') return null;
  if (typeof nameOrId === 'number') return byId.get(nameOrId) ?? null;
  const s = String(nameOrId);
  if (/^\d+$/.test(s)) return byId.get(Number(s)) ?? null;
  return byName.get(s) ?? null;
}

/**
 * @param {object|null|undefined} reaction
 * @returns {{ id: string, label: string, hint: string }}
 */
export function inferRealmFromCatalog(reaction) {
  const info = getReactionTypeInfo(reaction?.ReactionType);
  if (!info?.realm) {
    return null;
  }
  if (reaction?.DoForAllPlayers) {
    return {
      id: 'server-broadcast',
      label: 'Server → all players',
      hint: info.summary || 'Server broadcast reaction.',
    };
  }
  if (reaction?.DoForConvoy) {
    return {
      id: 'server-convoy',
      label: 'Server → convoy',
      hint: info.summary || 'Convoy-scoped reaction.',
    };
  }

  const type = reaction?.ReactionType || '';
  const textTarget = reaction?.Text?.TargetType;
  if ((type === 'Text' || type === 'OpenDialog') && textTarget) {
    if (textTarget === 'Convoy') {
      return {
        id: 'client-convoy',
        label: 'Client UI (convoy)',
        hint: info.summary || 'Dialog shown to convoy members.',
      };
    }
    if (textTarget === 'Global') {
      return {
        id: 'client-global',
        label: 'Client UI (global)',
        hint: info.summary || 'Dialog broadcast broadly.',
      };
    }
  }

  if (info.realm === 'client') {
    return {
      id: 'client',
      label: 'Client UI',
      hint: info.summary || 'Client presentation reaction.',
    };
  }
  return {
    id: 'server',
    label: 'Server',
    hint: info.summary || 'Authoritative server logic.',
  };
}

/**
 * Label a reaction field value using catalog field roles.
 * @param {ReactionTypeInfo|null} info
 * @param {string} fieldName
 * @param {*} value
 * @param {object[]} [variables]
 */
export function formatCatalogField(info, fieldName, value, variables) {
  if (value == null || value === '' || value === 0) return null;
  const role = info?.fields?.[fieldName];
  const label = role?.label ?? fieldName;
  if (fieldName === 'GenericVar1' && role?.role === 'variableId') {
    const v = variables?.find((x) => x.Id === value);
    return `${label}: ${v?.Name ? v.Name : `var:${value}`}`;
  }
  return `${label}: ${value}`;
}

/**
 * Build detail lines for inspector from catalog + reaction instance.
 * @param {object} reaction
 * @param {object[]} [variables]
 * @returns {string[]}
 */
export function buildCatalogDetailLines(reaction, variables) {
  const info = getReactionTypeInfo(reaction?.ReactionType);
  if (!info) return [];
  const lines = [];
  if (info.description && info.description !== info.summary) {
    lines.push(info.description);
  }
  if (info.fields) {
    for (const [field, role] of Object.entries(info.fields)) {
      if (field === 'Objects' || field === 'Text') continue;
      const val = reaction[field];
      const formatted = formatCatalogField(info, field, val, variables);
      if (formatted) lines.push(formatted);
    }
  }
  if (info.callees?.length) {
    const resolved = resolveGhidraCallees(info.callees);
    if (resolved.length) {
      for (const fn of resolved) lines.push(formatGhidraCallee(fn));
    } else {
      lines.push(`Ghidra callees: ${info.callees.join(', ')}`);
    }
  }
  if (info.packets?.length) {
    lines.push(`Packets: ${info.packets.join(', ')}`);
  }
  if (info.implementationStatus) {
    lines.push(`AutoCore: ${info.implementationStatus}`);
  }
  return lines;
}

export { catalogData as reactionCatalog };
