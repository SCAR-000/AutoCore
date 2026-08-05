import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldIgnoreKeyEvent,
  movementSpeed,
  clampCameraSpeed,
  focusCameraOffset,
  focusViewDistance,
  mapDefaultCameraSpeed,
  CAMERA_SPEED_MIN,
  CAMERA_SPEED_FALLBACK_MAX,
} from './fly-controls-helpers.js';

describe('fly-controls-helpers', () => {
  it('shouldIgnoreKeyEvent skips text inputs but not range sliders', () => {
    assert.equal(shouldIgnoreKeyEvent({ target: { tagName: 'INPUT', type: 'search' } }), true);
    assert.equal(shouldIgnoreKeyEvent({ target: { tagName: 'INPUT', type: 'range' } }), false);
    assert.equal(shouldIgnoreKeyEvent({ target: { tagName: 'INPUT', type: 'checkbox' } }), false);
    assert.equal(shouldIgnoreKeyEvent({ target: { tagName: 'DIV' } }), false);
  });

  it('movementSpeed returns zero when idle', () => {
    const idle = { forward: false, back: false, left: false, right: false, up: false, down: false, boost: false };
    assert.equal(movementSpeed(idle, 400, 3, 0.016), 0);
  });

  it('movementSpeed applies boost multiplier', () => {
    const keys = { forward: true, back: false, left: false, right: false, up: false, down: false, boost: true };
    assert.equal(movementSpeed(keys, 400, 3, 0.016), 19.2);
  });

  it('clampCameraSpeed clamps and handles invalid input', () => {
    assert.equal(clampCameraSpeed(10), CAMERA_SPEED_MIN);
    assert.equal(clampCameraSpeed(99999), CAMERA_SPEED_FALLBACK_MAX);
    assert.equal(clampCameraSpeed('nope'), CAMERA_SPEED_MIN);
    assert.equal(clampCameraSpeed(420), 420);
    assert.equal(clampCameraSpeed(500, 40, 300), 300);
  });

  it('mapDefaultCameraSpeed scales with map span', () => {
    assert.equal(mapDefaultCameraSpeed(1000), 350);
    assert.equal(mapDefaultCameraSpeed(10), CAMERA_SPEED_MIN);
  });

  it('focusViewDistance respects radius hint and minimum standoff', () => {
    assert.equal(focusViewDistance(10, 5), 40);
    assert.equal(focusViewDistance(100, 5), 100);
    assert.equal(focusViewDistance(10, 30), 60);
  });

  it('focusCameraOffset scales distance into view offset', () => {
    assert.deepEqual(focusCameraOffset(100), { x: 40, y: 35, z: 50 });
  });
});
