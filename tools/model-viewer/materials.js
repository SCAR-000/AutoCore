/**
 * materials.js — turn parsed .geo section material records into three.js materials.
 *
 * - Textures are the game's own DXT1/3/5 .dds files loaded with DDSLoader
 *   (compressed textures cannot flipY; the parser emits raw D3D UVs which line
 *   up with unflipped DDS — verified on the dune buggy).
 * - Texture names resolve via index.json's lowercase-basename map with a
 *   quality-tier fallback chain: exact -> mq_ -> lq_ -> prefix-stripped.
 * - Vehicle paint (NDHumanCar.fx & friends) implements the engine's tint path
 *   (see docs/geo-format.md):
 *       combined = tint.r * primary + tint.b * secondary (+ tint.g * tertiary)
 *       diffuse.rgb = lerp(diffuse.rgb, combined, tint.a)
 *   with the tint atlas <diffuse-stem>_NN_tint.dds selected per paint scheme.
 */

import * as THREE from 'three';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';

const ddsLoader = new DDSLoader();

export class TextureBank {
  /**
   * @param {Record<string,string>} textureIndex lowercase basename -> repo-relative path
   * @param {string} rootPrefix path prefix from the page to the repo root (e.g. '../../')
   */
  constructor(textureIndex, rootPrefix) {
    this.index = textureIndex;
    this.rootPrefix = rootPrefix;
    this.cache = new Map();
    this.missing = new Set();
    this.placeholder = makePlaceholderTexture();
  }

  /** Resolve a .dds basename to a repo-relative path, or null. */
  resolvePath(name) {
    if (!name) return null;
    const key = name.toLowerCase();
    const candidates = [key, `mq_${key}`, `lq_${key}`];
    for (const prefix of ['lq_', 'mq_']) {
      if (key.startsWith(prefix)) candidates.push(key.slice(prefix.length));
    }
    for (const cand of candidates) {
      const hit = this.index[cand];
      if (hit) return hit;
    }
    return null;
  }

  has(name) {
    return this.resolvePath(name) !== null;
  }

  /**
   * Load (and cache) a texture by .dds basename.
   * @returns {{texture: THREE.Texture, resolved: boolean}}
   */
  load(name, { srgb = false } = {}) {
    const path = this.resolvePath(name);
    if (!path) {
      this.missing.add(name);
      return { texture: this.placeholder, resolved: false };
    }
    const cacheKey = `${path}|${srgb ? 's' : 'l'}`;
    let texture = this.cache.get(cacheKey);
    if (!texture) {
      texture = ddsLoader.load(this.rootPrefix + path);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      this.cache.set(cacheKey, texture);
    }
    return { texture, resolved: true };
  }
}

function makePlaceholderTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#ff00ff' : '#1a1a1a';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function color4(params, name, fallback) {
  const v = params[name];
  if (Array.isArray(v) && v.length >= 3) return new THREE.Color(v[0], v[1], v[2]);
  return fallback ? new THREE.Color(...fallback) : null;
}

function scalar(params, name, fallback) {
  const v = params[name];
  if (Array.isArray(v) && v.length) return v[0];
  if (typeof v === 'number') return v;
  return fallback;
}

/** Engine defaults from NDVehicleTint.sha. */
export const TINT_DEFAULTS = {
  primary: [0.23, 0.41, 0.22],
  secondary: [0.25, 0.18, 0.13],
  tertiary: [1.0, 0.18, 0.13],
};

export function isShadowEffect(effect) {
  return /shadowprojection/i.test(effect || '');
}

export function isTintEffect(effect) {
  return /tint|humancar|biomekcar|mutantcar/i.test(effect || '');
}

/** Paint schemes available for a diffuse texture: probe <stem>_NN_tint.dds. */
export function tintSchemesFor(bank, diffuseName) {
  if (!diffuseName) return [];
  const stem = diffuseName.replace(/\.dds$/i, '');
  const schemes = [];
  for (const nn of ['01', '02', '03', '04', '05']) {
    if (bank.has(`${stem}_${nn}_tint.dds`)) schemes.push(nn);
  }
  return schemes;
}

/**
 * Build a THREE.Material for one parsed geo section.
 *
 * @param {object} section parsed section ({effect, params, ...})
 * @param {TextureBank} bank
 * @param {object} opts {tintScheme, primary, secondary, texturesEnabled}
 * @returns {{material: THREE.Material, info: object}}
 */
export function buildMaterial(section, bank, opts = {}) {
  const { effect, params } = section;
  const info = { effect, textures: [], missing: [], tintable: false };

  const material = new THREE.MeshPhongMaterial({
    color: color4(params, 'MatDiffuse', [1, 1, 1]),
    specular: color4(params, 'MatSpecular', [0.35, 0.35, 0.38]).multiplyScalar(0.3),
    shininess: Math.max(2, scalar(params, 'MatPower', 20)),
  });
  material.name = effect || 'default';

  const emissive = color4(params, 'MatEmissive', null);
  if (emissive) material.emissive = emissive.multiplyScalar(0.35);

  if (isShadowEffect(effect)) {
    // Shadow-volume mesh: render as translucent slab if the user unhides it.
    material.color = new THREE.Color(0x111118);
    material.transparent = true;
    material.opacity = 0.35;
    return { material, info };
  }

  const texturesEnabled = opts.texturesEnabled !== false;
  const diffuseName = typeof params.DiffuseTexture === 'string' ? params.DiffuseTexture : null;
  const normalName = typeof params.NormalMapTexture === 'string' ? params.NormalMapTexture : null;
  const glowName = typeof params.GlowTexture === 'string' ? params.GlowTexture : null;

  if (texturesEnabled && diffuseName) {
    const { texture, resolved } = bank.load(diffuseName, { srgb: true });
    material.map = texture;
    (resolved ? info.textures : info.missing).push(diffuseName);
  }
  if (texturesEnabled && normalName && section.uvs) {
    const { texture, resolved } = bank.load(normalName);
    if (resolved) {
      material.normalMap = texture;
      material.normalScale = new THREE.Vector2(0.8, 0.8);
      info.textures.push(normalName);
    } else {
      info.missing.push(normalName);
    }
  }
  if (texturesEnabled && glowName) {
    const { texture, resolved } = bank.load(glowName, { srgb: true });
    if (resolved) {
      material.emissiveMap = texture;
      material.emissive = new THREE.Color(0xffffff);
      info.textures.push(glowName);
    } else {
      info.missing.push(glowName);
    }
  }

  if (params.AlphaTestEnable === true) {
    material.alphaTest = 0.5;
    material.side = THREE.DoubleSide;
  }

  // Vehicle paint: tint atlas modulated by primary/secondary colours.
  if (texturesEnabled && isTintEffect(effect) && diffuseName) {
    const schemes = tintSchemesFor(bank, diffuseName);
    if (schemes.length) {
      info.tintable = true;
      info.tintSchemes = schemes;
      const scheme = opts.tintScheme && schemes.includes(opts.tintScheme) ? opts.tintScheme : schemes[0];
      const stem = diffuseName.replace(/\.dds$/i, '');
      const tintTex = bank.load(`${stem}_${scheme}_tint.dds`, { srgb: true }).texture;
      info.textures.push(`${stem}_${scheme}_tint.dds`);

      const primary = new THREE.Color(...(opts.primary ?? color4(params, 'MatColorPrimary', TINT_DEFAULTS.primary).toArray()));
      const secondary = new THREE.Color(...(opts.secondary ?? color4(params, 'MatColorSecondary', TINT_DEFAULTS.secondary).toArray()));

      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTintMap = { value: tintTex };
        shader.uniforms.uTintPrimary = { value: primary };
        shader.uniforms.uTintSecondary = { value: secondary };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform sampler2D uTintMap;
uniform vec3 uTintPrimary;
uniform vec3 uTintSecondary;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec4 tint = texture2D(uTintMap, vMapUv);
  vec3 combined = tint.r * uTintPrimary + tint.b * uTintSecondary;
  diffuseColor.rgb = mix(diffuseColor.rgb, combined, tint.a);
}`);
        material.userData.shader = shader;
      };
      // The tint atlas carries the visible paint; keep the near-black base map
      // from crushing everything when lit.
      material.customProgramCacheKey = () => `tint|${stem}|${scheme}`;
    }
  }

  return { material, info };
}
