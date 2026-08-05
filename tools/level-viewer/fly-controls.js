/**
 * fly-controls.js — WASD fly camera for the level viewer.
 */

import * as THREE from 'three';
import { shouldIgnoreKeyEvent, movementSpeed, keyToAction } from './fly-controls-helpers.js';

export { shouldIgnoreKeyEvent, movementSpeed } from './fly-controls-helpers.js';

export class FlyControls {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement
   * @param {{ speed?: number, boostMultiplier?: number, lookSpeed?: number, onChange?: (enabled: boolean) => void }} [opts]
   */
  constructor(camera, domElement, opts = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.speed = opts.speed ?? 420;
    this.boostMultiplier = opts.boostMultiplier ?? 3;
    this.lookSpeed = opts.lookSpeed ?? 0.0022;
    this.onChange = opts.onChange ?? (() => {});

    this.enabled = false;
    this.keys = { forward: false, back: false, left: false, right: false, up: false, down: false, boost: false };
    this.yaw = 0;
    this.pitch = 0;
    this.isLooking = false;

    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._move = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onContextMenu = (e) => { if (this.enabled) e.preventDefault(); };
  }

  connect() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) this._syncAnglesFromCamera();
    else {
      this.isLooking = false;
      this._clearKeys();
    }
    this.onChange(enabled);
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  /** Re-read yaw/pitch from the camera quaternion (after programmatic lookAt / reposition). */
  syncFromCamera() {
    if (!this.enabled) return;
    this._syncAnglesFromCamera();
  }

  /** @param {number} speed */
  setSpeed(speed) {
    this.speed = speed;
  }

  /** @param {number} dt seconds */
  update(dt) {
    if (!this.enabled) return;

    const dist = movementSpeed(this.keys, this.speed, this.boostMultiplier, dt);
    if (dist <= 0) return;

    this.camera.getWorldDirection(this._forward);
    this._right.crossVectors(this._forward, this._up).normalize();

    this._move.set(0, 0, 0);
    if (this.keys.forward) this._move.add(this._forward);
    if (this.keys.back) this._move.sub(this._forward);
    if (this.keys.right) this._move.add(this._right);
    if (this.keys.left) this._move.sub(this._right);
    if (this.keys.up) this._move.add(this._up);
    if (this.keys.down) this._move.sub(this._up);

    if (this._move.lengthSq() === 0) return;
    this._move.normalize().multiplyScalar(dist);
    this.camera.position.add(this._move);
  }

  _syncAnglesFromCamera() {
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this._euler.y;
    this.pitch = this._euler.x;
  }

  _applyRotation() {
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
  }

  _clearKeys() {
    for (const k of Object.keys(this.keys)) this.keys[k] = false;
  }

  _setKey(code, down) {
    const name = keyToAction(code);
    if (!name) return;
    if (name === 'boost') this.keys.boost = down;
    else this.keys[name] = down;
  }

  _onKeyDown(event) {
    if (!this.enabled || shouldIgnoreKeyEvent(event)) return;
    if (!keyToAction(event.code)) return;
    this._setKey(event.code, true);
    event.preventDefault();
  }

  _onKeyUp(event) {
    if (!this.enabled || shouldIgnoreKeyEvent(event)) return;
    if (!keyToAction(event.code)) return;
    this._setKey(event.code, false);
    event.preventDefault();
  }

  _onMouseDown(event) {
    if (!this.enabled || event.button !== 0) return;
    this.isLooking = true;
    event.preventDefault();
  }

  _onMouseUp() {
    this.isLooking = false;
  }

  _onMouseMove(event) {
    if (!this.enabled || !this.isLooking) return;
    this.yaw -= event.movementX * this.lookSpeed;
    this.pitch -= event.movementY * this.lookSpeed;
    this._applyRotation();
  }
}
