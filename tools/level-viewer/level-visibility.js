/**
 * Pure placement classification for the level viewer visibility toggles.
 * No DOM/THREE dependencies — testable from Node.
 */

/** @typedef {'trigger'|'resolved-physics'|'resolved-graphics'|'unresolved'|'parse-failed'} PlacementCategory */

/** @typedef {'spawn'|'enter'|'store'|'outpost'} MarkerKind */

/** Human-readable marker sphere labels, colors, and tooltip descriptions. */
export const MARKER_KIND_INFO = {
  spawn: {
    label: 'Spawn Point',
    color: '#40ff80',
    description: 'Green sphere — where NPCs and enemies spawn on this map.',
  },
  enter: {
    label: 'Enter Point',
    color: '#40b0ff',
    description: 'Blue sphere — map transfer / zone entrance to another map or interior.',
  },
  store: {
    label: 'Store',
    color: '#ffd040',
    description: 'Yellow sphere — vendor, junkyard, or garage (shops and vehicle services).',
  },
  outpost: {
    label: 'Outpost',
    color: '#ff7040',
    description: 'Orange sphere — territory capture / control point.',
  },
};

/**
 * @param {string|undefined} kind
 * @returns {{ label: string, color: string, description: string }}
 */
export function markerKindInfo(kind) {
  return MARKER_KIND_INFO[kind] ?? {
    label: kind || 'Marker',
    color: '#ffffff',
    description: 'Map editor marker.',
  };
}

/**
 * @param {{ Type?: string, Reactions?: unknown[] }} obj
 * @returns {boolean}
 */
export function isTrigger(obj) {
  return obj?.Type === 'Trigger' || (Array.isArray(obj?.Reactions) && obj?.TargetType != null);
}

/**
 * @param {{ Triggers?: unknown[], Objects?: { Type?: string }[] }} data
 * @returns {number}
 */
export function countTriggers(data) {
  if (data?.Triggers?.length) return data.Triggers.length;
  return (data?.Objects || []).filter(isTrigger).length;
}

/**
 * Classify a map placement for visibility filtering.
 *
 * @param {{ Type?: string }} obj
 * @param {{ resolved?: boolean, parseFailed?: boolean }} opts
 * @returns {PlacementCategory}
 */
export function placementCategory(obj, { resolved = false, parseFailed = false } = {}) {
  if (isTrigger(obj)) return 'trigger';
  if (parseFailed) return 'parse-failed';
  if (resolved) {
    return obj?.Type === 'Object' ? 'resolved-graphics' : 'resolved-physics';
  }
  return 'unresolved';
}

/**
 * Map clonebase Type to resolved-mesh userData.category.
 *
 * @param {string|undefined} type
 * @returns {'resolved-physics'|'resolved-graphics'}
 */
export function resolvedMeshCategory(type) {
  return type === 'Object' ? 'resolved-graphics' : 'resolved-physics';
}

/**
 * When several trigger spheres overlap, pick the innermost (smallest radius).
 * Tie-break: later instance index (last sphere placed in the dump).
 *
 * @param {Array<{ instanceId: number, object: { userData?: { objs?: unknown[] } } }>} hits
 * @param {(hit: unknown) => { _category?: string, Scale?: number } | null | undefined} getPlacement
 * @returns {typeof hits[0] | null}
 */
export function pickTriggerHit(hits, getPlacement) {
  const triggerHits = [];
  for (const hit of hits) {
    const placement = getPlacement(hit);
    if (placement?._category === 'trigger') triggerHits.push({ hit, placement });
  }
  if (!triggerHits.length) return null;
  triggerHits.sort((a, b) => {
    const sa = Math.max(a.placement.Scale || 1, 1);
    const sb = Math.max(b.placement.Scale || 1, 1);
    if (sa !== sb) return sa - sb;
    return b.hit.instanceId - a.hit.instanceId;
  });
  return triggerHits[0].hit;
}
