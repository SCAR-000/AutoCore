/**
 * Infer likely server vs client execution realm for map reactions.
 * Heuristic only — map files have no explicit realm field.
 */

/** Reaction types that primarily present UI/audio on the client (server still initiates). */
export const CLIENT_UI_REACTION_TYPES = new Set([
  'ClientText',
  'Text',
  'OpenDialog',
  'OpenStore',
  'OpenBodyShop',
  'OpenRefinery',
  'OpenGarage',
  'OpenArena',
  'OpenClanManager',
  'OpenSkillTrainer',
  'OpenMailBox',
  'OpenAuctionHouse',
  'PlayMusic',
  'SetStatusText',
  'SetProgressBar',
  'ProgressBar',
  'RemoveProgressBar',
  'RemoveText',
  'SetMapWaypoint',
  'SetMapDynamicWaypoint',
  'RemoveMapWaypoint',
  'RemoveMapDynamicWaypoint',
  'GiveMissionDialog',
]);

/**
 * @param {object|null|undefined} reaction
 * @returns {{ id: string, label: string, hint: string }}
 */
export function inferReactionExecutionRealm(reaction) {
  if (!reaction) {
    return {
      id: 'unknown',
      label: 'Unknown',
      hint: 'Reaction record not found on this map.',
    };
  }

  const type = reaction.ReactionType || '';
  const textTarget = reaction.Text?.TargetType;

  if (reaction.DoForAllPlayers) {
    return {
      id: 'server-broadcast',
      label: 'Server → all players',
      hint: 'Sector server runs this reaction, then broadcasts state to everyone on the map.',
    };
  }

  if (reaction.DoForConvoy) {
    return {
      id: 'server-convoy',
      label: 'Server → convoy',
      hint: 'Sector server runs this reaction, then sends updates to convoy members.',
    };
  }

  if (type === 'ClientText') {
    return {
      id: 'client',
      label: 'Client UI',
      hint: 'Client-only text presentation.',
    };
  }

  if ((type === 'Text' || type === 'OpenDialog') && textTarget) {
    if (textTarget === 'Convoy') {
      return {
        id: 'client-convoy',
        label: 'Client UI (convoy)',
        hint: 'Dialog or text shown to convoy members.',
      };
    }
    if (textTarget === 'Global') {
      return {
        id: 'client-global',
        label: 'Client UI (global)',
        hint: 'Dialog or text broadcast broadly to clients.',
      };
    }
    return {
      id: 'client',
      label: 'Client UI',
      hint: 'Dialog or text shown to the activating player\'s client.',
    };
  }

  if (CLIENT_UI_REACTION_TYPES.has(type)) {
    return {
      id: 'client',
      label: 'Client UI',
      hint: 'Server initiates; primary effect is client presentation (UI, text, or audio).',
    };
  }

  return {
    id: 'server',
    label: 'Server',
    hint: 'Authoritative game logic on the sector server (may notify clients via packets).',
  };
}

/** @param {{ id: string, label: string }} realm */
export function realmBadgeClass(realm) {
  if (realm.id.startsWith('client')) return 'tp-realm client';
  if (realm.id.startsWith('server')) return 'tp-realm server';
  return 'tp-realm unknown';
}
