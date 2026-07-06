/**
 * vehicle-equipment-lib.js — clonebase equipment compatibility (Node-testable).
 */

/** @typedef {'front'|'turret'|'rear'} WeaponSlotKind */
/** @typedef {'wheelset'|'ornament'|'armor'} OtherSlotKind */
/** @typedef {WeaponSlotKind|OtherSlotKind} SlotKind */

export const WEAPON_SLOT_BITS = {
  front: 0x2,
  rear: 0x4,
  turret: 0x10,
};

export const WEAPON_SLOT_INDEX = {
  front: 0,
  turret: 1,
  rear: 2,
};

/**
 * @param {number} vehicleFlags VehicleSpecific.VehicleFlags
 * @returns {{ front: boolean, rear: boolean, turret: boolean }}
 */
export function parseWeaponSlotFlags(vehicleFlags) {
  const f = Number(vehicleFlags) || 0;
  return {
    front: (f & WEAPON_SLOT_BITS.front) !== 0,
    rear: (f & WEAPON_SLOT_BITS.rear) !== 0,
    turret: (f & WEAPON_SLOT_BITS.turret) !== 0,
  };
}

/**
 * @param {object|null|undefined} catalog
 * @param {number} cbid
 */
export function getVehicleEquipment(catalog, cbid) {
  if (!catalog?.Vehicles) return null;
  return catalog.Vehicles.find((v) => v.Cbid === cbid) ?? null;
}

/**
 * @param {object|null|undefined} catalog
 * @param {number} cbid
 */
export function getCatalogPart(catalog, cbid, collection) {
  if (!catalog?.[collection] || cbid == null) return null;
  return catalog[collection].find((p) => p.Cbid === cbid) ?? null;
}

/**
 * @param {object} vehicleEq VehicleEquipmentEntry
 * @param {object} weapon WeaponEntry
 * @param {WeaponSlotKind} slot
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canEquipWeapon(vehicleEq, weapon, slot) {
  if (!vehicleEq || !weapon) return { ok: false, reason: 'missing data' };

  const slots = parseWeaponSlotFlags(vehicleEq.VehicleFlags);
  if (slot === 'front' && !slots.front) return { ok: false, reason: 'no front hardpoint' };
  if (slot === 'rear' && !slots.rear) return { ok: false, reason: 'no rear hardpoint' };
  if (slot === 'turret' && !slots.turret) return { ok: false, reason: 'no turret hardpoint' };

  if (slot === 'front' && !weapon.CanBeFront) return { ok: false, reason: 'weapon not front-mountable' };
  if (slot === 'rear' && !weapon.CanBeBack) return { ok: false, reason: 'weapon not rear-mountable' };
  if (slot === 'turret' && !weapon.CanBeTurret) return { ok: false, reason: 'weapon not turret-mountable' };

  const maxWt = slot === 'front'
    ? vehicleEq.MaxWtWeaponFront
    : slot === 'turret'
      ? vehicleEq.MaxWtWeaponTurret
      : vehicleEq.MaxWtWeaponDrop;

  if (weapon.Mass > maxWt) {
    return { ok: false, reason: `mass ${weapon.Mass} > limit ${maxWt}` };
  }

  if (slot === 'turret' && weapon.TurretSize > vehicleEq.TurretSize) {
    return { ok: false, reason: `turret size ${weapon.TurretSize} > chassis ${vehicleEq.TurretSize}` };
  }

  const classOk = checkClass(vehicleEq.ClassType, weapon.RequiredClass);
  if (!classOk.ok) return classOk;

  return { ok: true };
}

/**
 * @param {object} vehicleEq
 * @param {object} wheelSet
 */
export function canEquipWheelSet(vehicleEq, wheelSet) {
  if (!vehicleEq || !wheelSet) return { ok: false, reason: 'missing data' };
  return { ok: true };
}

/**
 * @param {object} vehicleEq
 * @param {object} ornament
 */
export function canEquipOrnament(vehicleEq, ornament) {
  if (!vehicleEq || !ornament) return { ok: false, reason: 'missing data' };
  if (ornament.SubType !== 10) return { ok: false, reason: 'not an ornament kit' };
  return checkClass(vehicleEq.ClassType, ornament.RequiredClass);
}

/**
 * @param {object} vehicleEq
 * @param {object} armor
 */
export function canEquipArmor(vehicleEq, armor) {
  if (!vehicleEq || !armor) return { ok: false, reason: 'missing data' };
  if (armor.Mass > vehicleEq.MaxWtArmor) {
    return { ok: false, reason: `mass ${armor.Mass} > limit ${vehicleEq.MaxWtArmor}` };
  }
  return checkClass(vehicleEq.ClassType, armor.RequiredClass);
}

/**
 * Character-class prerequisites are not modeled in play.html (no avatar context).
 * @param {number} _vehicleClassType
 * @param {number} _requiredClass
 */
export function checkClass(_vehicleClassType, _requiredClass) {
  return { ok: true };
}

/**
 * @param {object} catalog
 * @param {number} vehicleCbid
 * @param {SlotKind} slotKind
 * @returns {Array<object & { compatible: boolean, reason?: string }>}
 */
export function listCompatibleParts(catalog, vehicleCbid, slotKind) {
  const vehicleEq = getVehicleEquipment(catalog, vehicleCbid);
  if (!vehicleEq) return [];

  let parts = [];
  let checker = null;

  switch (slotKind) {
    case 'front':
    case 'turret':
    case 'rear':
      parts = catalog.Weapons ?? [];
      checker = (w) => canEquipWeapon(vehicleEq, w, slotKind);
      break;
    case 'wheelset':
      parts = catalog.WheelSets ?? [];
      checker = (w) => canEquipWheelSet(vehicleEq, w);
      break;
    case 'ornament':
      parts = catalog.Ornaments ?? [];
      checker = (o) => canEquipOrnament(vehicleEq, o);
      break;
    case 'armor':
      parts = catalog.Armors ?? [];
      checker = (a) => canEquipArmor(vehicleEq, a);
      break;
    default:
      return [];
  }

  return parts.map((part) => {
    const result = checker(part);
    return { ...part, compatible: result.ok, reason: result.reason };
  });
}

/**
 * Default empty loadout.
 * @returns {{ front: number|null, turret: number|null, rear: number|null, wheelset: number|null, ornament: number|null, armor: number|null }}
 */
export function emptyLoadout() {
  return {
    front: null,
    turret: null,
    rear: null,
    wheelset: null,
    ornament: null,
    armor: null,
  };
}

/**
 * @param {object|null|undefined} catalog
 * @param {number} vehicleCbid
 */
export function defaultLoadoutForVehicle(catalog, vehicleCbid) {
  const loadout = emptyLoadout();
  const vehicleEq = getVehicleEquipment(catalog, vehicleCbid);
  if (vehicleEq?.DefaultWheelset > 0) {
    loadout.wheelset = vehicleEq.DefaultWheelset;
  }
  return loadout;
}

/**
 * Resolve wheel geo names from loadout or vehicle physics defaults.
 * @param {object} vehicle from vehicle-physics.json
 * @param {object|null|undefined} catalog
 * @param {object} loadout
 */
export function resolveWheelNames(vehicle, catalog, loadout) {
  const wheelSetCbid = loadout?.wheelset ?? null;
  const wheelSet = wheelSetCbid
    ? getCatalogPart(catalog, wheelSetCbid, 'WheelSets')
    : null;

  if (wheelSet) {
    return {
      wheel0: wheelSet.Wheel0Name,
      wheel1: wheelSet.Wheel1Name,
      friction: wheelSet.Friction,
      wheelSetType: wheelSet.WheelSetType,
    };
  }

  return {
    wheel0: vehicle.Wheel0Name,
    wheel1: vehicle.Wheel1Name,
    friction: vehicle.WheelFriction,
    wheelSetType: vehicle.WheelSetType,
  };
}

/**
 * Y-axis rotation for a weapon hardpoint (port of FUN_005fb6a0 slot rules).
 * Rear weapons face -Z; 6-wheel vehicles mirror even slot indices.
 *
 * @param {WeaponSlotKind} slotKind
 * @param {number} slotIndex 0=front, 1=turret, 2=rear
 * @param {number} wheelAxle VehicleSpecific.WheelAxle
 * @returns {number} radians
 */
export function weaponSlotRotationY(slotKind, slotIndex, wheelAxle) {
  let yaw = slotKind === 'rear' ? Math.PI : 0;
  if (Number(wheelAxle) > 2 && slotIndex % 2 === 0) {
    yaw += Math.PI;
  }
  return yaw;
}

/**
 * Align a body-kit geo (ornament/armor) to the loaded vehicle body floor.
 * Kits are authored in obj_veh space (floor near Y=0); shift so kit min-Y
 * matches the body mesh min-Y in the same container.
 *
 * @param {{ min?: number[] }|null|undefined} bodyBBox
 * @param {{ min?: number[] }|null|undefined} kitBBox
 * @returns {{ x: number, y: number, z: number }}
 */
export function alignKitToBodyOffset(bodyBBox, kitBBox) {
  if (!bodyBBox?.min || !kitBBox?.min) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: bodyBBox.min[0] - kitBBox.min[0],
    y: bodyBBox.min[1] - kitBBox.min[1],
    z: bodyBBox.min[2] - kitBBox.min[2],
  };
}

/**
 * Local offset so weapon mount corner (min Z, floor Y) sits on the hardpoint.
 *
 * @param {{ min?: number[] }|null|undefined} geoBBox
 * @returns {{ x: number, y: number, z: number }}
 */
export function weaponMeshLocalOffset(geoBBox) {
  if (!geoBBox?.min) return { x: 0, y: 0, z: 0 };
  return {
    x: 0,
    y: -geoBBox.min[1],
    z: -geoBBox.min[2],
  };
}

/**
 * Hardpoint position for a weapon slot.
 * @param {object} vehicleEq
 * @param {WeaponSlotKind} slot
 */
export function hardPointForSlot(vehicleEq, slot) {
  const idx = WEAPON_SLOT_INDEX[slot];
  return vehicleEq?.HardPoints?.[idx] ?? null;
}
