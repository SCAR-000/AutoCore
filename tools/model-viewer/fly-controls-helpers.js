/**
 * Pure helpers for fly controls (no THREE dependency — testable from Node).
 */

const KEY_MAP = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyE: 'up',
  KeyQ: 'down',
  Space: 'up',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function shouldIgnoreKeyEvent(event) {
  const t = event.target;
  if (!t || typeof t !== 'object') return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(t.isContentEditable)) return true;
  if (tag !== 'INPUT') return false;
  const type = (t.type || 'text').toLowerCase();
  // Range/checkbox/radio/button keep fly keys working while focused.
  return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button';
}

/**
 * @param {Record<string, boolean>} keys
 * @param {number} speed
 * @param {number} boostMultiplier
 * @param {number} dt
 * @returns {number}
 */
export function movementSpeed(keys, speed, boostMultiplier, dt) {
  const moving = keys.forward || keys.back || keys.left || keys.right || keys.up || keys.down;
  if (!moving) return 0;
  const mult = keys.boost ? boostMultiplier : 1;
  return speed * mult * dt;
}

/** @param {string} code @returns {string|undefined} */
export function keyToAction(code) {
  return KEY_MAP[code];
}

export const CAMERA_SPEED_MIN = 40;
/** Fallback max before a map sets a span-based ceiling. */
export const CAMERA_SPEED_FALLBACK_MAX = 420;

/** Map-span default fly speed; also used as the slider maximum per map. */
export function mapDefaultCameraSpeed(span) {
  return Math.max(span * 0.35, CAMERA_SPEED_MIN);
}

/** @param {number} speed @param {number} [min] @param {number} [max] @returns {number} */
export function clampCameraSpeed(speed, min = CAMERA_SPEED_MIN, max = CAMERA_SPEED_FALLBACK_MAX) {
  const n = Number(speed);
  if (!Number.isFinite(n)) return min;
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(min, n));
}

/**
 * World-space offset from a focus target to the camera (matches level viewer framing).
 * @param {number} distance
 * @returns {{ x: number, y: number, z: number }}
 */
export function focusCameraOffset(distance) {
  return { x: distance * 0.4, y: distance * 0.35, z: distance * 0.5 };
}

/**
 * @param {number} currentDistance distance from camera to target
 * @param {number} [radiusHint] optional object radius / size hint
 * @returns {number}
 */
export function focusViewDistance(currentDistance, radiusHint = 40) {
  const hint = Math.max(radiusHint, 1);
  return Math.max(currentDistance, hint * 2, 40);
}
