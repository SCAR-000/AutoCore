/**
 * vehicle-equipment-mesh.js — mount equipment geos on vehicle hardpoints (Three.js).
 */

import * as THREE from 'three';
import {
  buildGeoGroup,
  pickLod0Sections,
  resolveModelStem,
} from './geo-mesh.js';
import {
  WEAPON_SLOT_INDEX,
  alignKitToBodyOffset,
  hardPointForSlot,
  weaponMeshLocalOffset,
  weaponSlotRotationY,
} from './vehicle-equipment-lib.js';

/**
 * Build a mount group at a vehicle weapon hardpoint (simplified FUN_005fb6a0).
 * HardPointFacing is not a yaw-in-degrees field — orientation comes from slot rules.
 *
 * @param {{ X: number, Y: number, Z: number }|null} hardPoint
 * @param {import('./vehicle-equipment-lib.js').WeaponSlotKind} slotKind
 * @param {number} slotIndex 0=front, 1=turret, 2=rear
 * @param {number} wheelAxle
 */
export function buildHardpointGroup(hardPoint, slotKind, slotIndex, wheelAxle) {
  const group = new THREE.Group();
  if (!hardPoint) return group;

  group.position.set(hardPoint.X, hardPoint.Y, hardPoint.Z);
  group.rotation.y = weaponSlotRotationY(slotKind, slotIndex, wheelAxle);

  return group;
}

/**
 * Attach a parsed geo as child; scale is applied uniformly from clonebase Scale.
 *
 * @param {THREE.Group} parentGroup
 * @param {import('./geo-parser.js').GeoParseResult} parsed
 * @param {import('./materials.js').TextureBank} textureBank
 * @param {object} [opts]
 */
export function attachEquipmentMesh(parentGroup, parsed, textureBank, opts = {}) {
  const {
    scale = 1,
    castShadow = true,
    position = null,
  } = opts;

  const sections = pickLod0Sections(parsed.sections);
  const { group: parts } = buildGeoGroup(
    { sections },
    textureBank,
    { texturesEnabled: true, castShadow, receiveShadow: false },
  );

  const meshRoot = new THREE.Group();
  meshRoot.add(parts);

  const s = Number(scale) || 1;
  if (s !== 1) meshRoot.scale.set(s, s, s);

  if (position) {
    meshRoot.position.set(position.x, position.y, position.z);
  }

  parentGroup.add(meshRoot);
  return meshRoot;
}

/**
 * Load and attach an equipment part by catalog entry.
 *
 * @param {THREE.Group} parentGroup
 * @param {object} part catalog entry with UniqueName / PhysicsName
 * @param {Map<string,string>} modelByStem
 * @param {function(string): Promise<object|null>} loadGeoModel
 * @param {import('./materials.js').TextureBank} textureBank
 * @param {object} [opts]
 * @returns {Promise<import('./geo-parser.js').GeoParseResult|null>}
 */
export async function attachPartMesh(parentGroup, part, modelByStem, loadGeoModel, textureBank, opts = {}) {
  const stem = resolveModelStem(modelByStem, [part.UniqueName, part.PhysicsName]);
  if (!stem) return null;

  const geo = await loadGeoModel(stem);
  if (!geo) return null;

  attachEquipmentMesh(parentGroup, geo, textureBank, {
    scale: opts.scale ?? part.Scale ?? 1,
    position: opts.position ?? null,
  });

  if (opts.weaponMount && geo.bodyBBox) {
    const last = parentGroup.children[parentGroup.children.length - 1];
    const off = weaponMeshLocalOffset(geo.bodyBBox);
    if (last) last.position.set(off.x, off.y, off.z);
  }

  return geo;
}

/**
 * Mount weapons, ornament, and armor onto bodyContainer.
 *
 * @param {THREE.Group} bodyContainer
 * @param {object} vehicleEq from equipment catalog
 * @param {object} loadout cbid map
 * @param {object} catalog full equipment catalog
 * @param {Map<string,string>} modelByStem
 * @param {function(string): Promise<object|null>} loadGeoModel
 * @param {import('./materials.js').TextureBank} textureBank
 * @param {{ min?: number[] }|null|undefined} [bodyBBox] loaded body geo bbox for kit alignment
 */
export async function attachLoadoutEquipment(
  bodyContainer,
  vehicleEq,
  loadout,
  catalog,
  modelByStem,
  loadGeoModel,
  textureBank,
  bodyBBox = null,
) {
  if (!vehicleEq || !loadout) return;

  const weaponSlots = [
    ['front', loadout.front],
    ['turret', loadout.turret],
    ['rear', loadout.rear],
  ];

  for (const [slot, cbid] of weaponSlots) {
    if (!cbid) continue;
    const weapon = catalog.Weapons?.find((w) => w.Cbid === cbid);
    if (!weapon) continue;

    const slotIndex = WEAPON_SLOT_INDEX[slot];
    const hp = hardPointForSlot(vehicleEq, slot);
    const mount = buildHardpointGroup(hp, slot, slotIndex, vehicleEq.WheelAxle);
    mount.name = `weapon-${slot}`;
    bodyContainer.add(mount);

    await attachPartMesh(mount, weapon, modelByStem, loadGeoModel, textureBank, {
      scale: weapon.Scale,
      weaponMount: true,
    });
  }

  const kitSlots = [
    ['ornament', loadout.ornament, catalog.Ornaments],
    ['armor', loadout.armor, catalog.Armors],
  ];

  for (const [name, cbid, collection] of kitSlots) {
    if (!cbid) continue;
    const part = collection?.find((p) => p.Cbid === cbid);
    if (!part) continue;

    const mount = new THREE.Group();
    mount.name = name;
    bodyContainer.add(mount);

    const geo = await attachPartMesh(mount, part, modelByStem, loadGeoModel, textureBank, {
      scale: part.Scale,
    });

    if (geo?.bodyBBox && bodyBBox) {
      const offset = alignKitToBodyOffset(bodyBBox, geo.bodyBBox);
      mount.position.set(offset.x, offset.y, offset.z);
    }
  }
}
