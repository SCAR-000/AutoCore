/**
 * Ghidra function registry for reaction callee display.
 * Source: ghidra-functions.json (regenerate via tools/scripts/sync-ghidra-functions.mjs).
 */

import registryData from './ghidra-functions.json' with { type: 'json' };

/** @typedef {{ address: string, legacyName: string, symbol: string, decompiledSignature: string, reactionTypes?: string[], confidence?: string }} GhidraFunctionEntry */

/** @type {Map<string, GhidraFunctionEntry>} */
const byAddress = new Map();
/** @type {Map<string, GhidraFunctionEntry>} */
const byLegacy = new Map();

for (const entry of Object.values(registryData.functions ?? {})) {
  const addr = entry.address.toLowerCase();
  byAddress.set(addr, entry);
  if (entry.legacyName) byLegacy.set(entry.legacyName.toLowerCase(), entry);
}

const ADDR_RE = /0x[0-9a-fA-F]+/;
const FUN_RE = /FUN_[0-9a-fA-F]+/i;

/**
 * @param {string} ref — address, FUN_ name, or catalog callee token
 * @returns {GhidraFunctionEntry|null}
 */
export function lookupGhidraFunction(ref) {
  if (!ref) return null;
  const s = String(ref).trim();
  const addrMatch = s.match(ADDR_RE);
  if (addrMatch) {
    return byAddress.get(addrMatch[0].toLowerCase()) ?? null;
  }
  const funMatch = s.match(FUN_RE);
  if (funMatch) {
    return byLegacy.get(funMatch[0].toLowerCase()) ?? null;
  }
  return null;
}

/**
 * @param {GhidraFunctionEntry|null} entry
 * @returns {string}
 */
export function formatGhidraCallee(entry) {
  if (!entry) return '';
  return `${entry.symbol} · ${entry.decompiledSignature} @ ${entry.address}`;
}

/**
 * @param {string[]} calleeRefs
 * @returns {GhidraFunctionEntry[]}
 */
export function resolveGhidraCallees(calleeRefs = []) {
  const seen = new Set();
  const out = [];
  for (const ref of calleeRefs) {
    if (!ref || ref.startsWith('vtable')) continue;
    const entry = lookupGhidraFunction(ref);
    if (!entry || seen.has(entry.address)) continue;
    seen.add(entry.address);
    out.push(entry);
  }
  return out;
}

/**
 * Build HTML rows for inspector (escaped strings expected by caller).
 * @param {GhidraFunctionEntry[]} entries
 * @param {(s: string) => string} escapeHtml
 */
export function buildGhidraCalleeHTML(entries, escapeHtml) {
  if (!entries?.length) return '';
  return entries
    .map(
      (e) =>
        `<div class="tp-ghidra-fn"><span class="symbol">${escapeHtml(e.symbol)}</span> ` +
        `<span class="decompiled">${escapeHtml(e.decompiledSignature)}</span> ` +
        `<span class="addr">${escapeHtml(e.address)}</span></div>`,
    )
    .join('');
}

export const GHIDRA_FUNCTION_COUNT = Object.keys(registryData.functions ?? {}).length;
export { registryData as ghidraFunctionRegistry };
