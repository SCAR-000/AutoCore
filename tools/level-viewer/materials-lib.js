/** Pure helpers for materials.js (no THREE dependency — testable in Node). */

export function isShadowEffect(effect) {
  return /shadowprojection/i.test(effect || '');
}

export function isTintEffect(effect) {
  return /tint|humancar|biomekcar|mutantcar/i.test(effect || '');
}

export function isPalDiffMapEffect(effect) {
  return /paldiffmap/i.test(effect || '');
}
