/**
 * geo-mesh.js — shared .geo → three.js mesh assembly (model viewer + play demo).
 *
 * Mirrors the section filter and mesh build path in viewer.js so play.html renders
 * vehicles the same way as index.html.
 */

import * as THREE from 'three';
import { buildMaterial } from './materials.js';
export {
  BAKED_WHEEL_Y_EPSILON,
  filterBodySections,
  geoAuthoredWheelMetrics,
  isBakedWheelSection,
  pickLod0Sections,
  resolveModelStem,
  sectionMaxY,
  sectionMinY,
  wheelMeshScaleFromPhysics,
} from './geo-mesh-lib.js';

/**
 * @param {import('./geo-parser.js').GeoSection} section
 * @returns {THREE.BufferGeometry}
 */
export function sectionGeometry(section) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(section.positions, 3));
  if (section.normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(section.normals, 3));
  }
  if (section.uvs) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(section.uvs, 2));
  }
  geometry.setIndex(new THREE.BufferAttribute(section.indices, 1));
  if (!section.normals) geometry.computeVertexNormals();
  return geometry;
}

/**
 * Build a THREE.Group from parsed geo sections.
 *
 * @param {{ sections: import('./geo-parser.js').GeoSection[] }} parsed
 * @param {import('./materials.js').TextureBank} bank
 * @param {object} [opts]
 * @returns {{ group: THREE.Group, infos: { section: import('./geo-parser.js').GeoSection, info: object }[] }}
 */
export function buildGeoGroup(parsed, bank, opts = {}) {
  const {
    texturesEnabled = true,
    tintScheme = null,
    primary = null,
    secondary = null,
    wireframe = false,
    castShadow = false,
    receiveShadow = false,
  } = opts;

  const group = new THREE.Group();
  const infos = [];

  for (const section of parsed.sections) {
    if (!section.indices?.length) continue;

    const geometry = sectionGeometry(section);
    const { material, info } = buildMaterial(section, bank, {
      tintScheme,
      primary,
      secondary,
      texturesEnabled,
    });
    material.wireframe = wireframe;
    infos.push({ section, info });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
  }

  return { group, infos };
}
