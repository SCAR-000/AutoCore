import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canEquipArmor,
  canEquipWeapon,
  checkClass,
  defaultLoadoutForVehicle,
  listCompatibleParts,
  parseWeaponSlotFlags,
  weaponSlotRotationY,
  alignKitToBodyOffset,
  weaponMeshLocalOffset,
} from './vehicle-equipment-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const catalogPath = path.join(__dirname, 'equipment-catalog.json');

/** @type {object|null} */
let catalog = null;
if (fs.existsSync(catalogPath)) {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

describe('parseWeaponSlotFlags', () => {
  it('flags 6 enables front and rear only', () => {
    const s = parseWeaponSlotFlags(6);
    assert.equal(s.front, true);
    assert.equal(s.rear, true);
    assert.equal(s.turret, false);
  });

  it('flags 22 enables front rear and turret', () => {
    const s = parseWeaponSlotFlags(22);
    assert.equal(s.front, true);
    assert.equal(s.rear, true);
    assert.equal(s.turret, true);
  });
});

describe('checkClass', () => {
  it('passes in play.html (character prerequisites not modeled)', () => {
    assert.equal(checkClass(1, 5).ok, true);
    assert.equal(checkClass(0, 3).ok, true);
  });
});

describe('canEquipWeapon', () => {
  const pikeHitman = {
    VehicleFlags: 6,
    MaxWtWeaponFront: 100,
    MaxWtWeaponTurret: 100,
    MaxWtWeaponDrop: 100,
    TurretSize: 1,
    ClassType: 0,
  };

  const callisto = {
    VehicleFlags: 22,
    MaxWtWeaponFront: 100,
    MaxWtWeaponTurret: 100,
    MaxWtWeaponDrop: 100,
    TurretSize: 1,
    ClassType: 0,
  };

  it('rejects turret on Pike Hitman (no turret hardpoint)', () => {
    const weapon = {
      CanBeFront: false,
      CanBeBack: false,
      CanBeTurret: true,
      Mass: 10,
      TurretSize: 1,
      RequiredClass: 0,
    };
    assert.equal(canEquipWeapon(pikeHitman, weapon, 'turret').ok, false);
  });

  it('allows turret on Callisto when weapon fits', () => {
    const weapon = {
      CanBeFront: false,
      CanBeBack: false,
      CanBeTurret: true,
      Mass: 10,
      TurretSize: 1,
      RequiredClass: 0,
    };
    assert.equal(canEquipWeapon(callisto, weapon, 'turret').ok, true);
  });

  it('rejects overweight weapons', () => {
    const weapon = {
      CanBeFront: true,
      CanBeBack: false,
      CanBeTurret: false,
      Mass: 150,
      TurretSize: 0,
      RequiredClass: 0,
    };
    assert.equal(canEquipWeapon(callisto, weapon, 'front').ok, false);
  });
});

describe('canEquipArmor', () => {
  it('rejects armor over max weight', () => {
    const veh = { MaxWtArmor: 50, ClassType: 0 };
    const armor = { Mass: 60, RequiredClass: 0 };
    assert.equal(canEquipArmor(veh, armor).ok, false);
  });
});

describe('weaponSlotRotationY', () => {
  it('rear slot faces backward', () => {
    assert.equal(weaponSlotRotationY('rear', 2, 0), Math.PI);
    assert.equal(weaponSlotRotationY('front', 0, 0), 0);
    assert.equal(weaponSlotRotationY('turret', 1, 0), 0);
  });

  it('6-wheel even slots add 180° yaw', () => {
    assert.equal(weaponSlotRotationY('front', 0, 3), Math.PI);
    assert.equal(weaponSlotRotationY('turret', 1, 3), 0);
    assert.equal(weaponSlotRotationY('rear', 2, 3), Math.PI * 2);
  });
});

describe('alignKitToBodyOffset', () => {
  it('raises kit floor to match veh body floor', () => {
    const body = { min: [-1.5, 0.337, -2.4] };
    const kit = { min: [-0.28, -0.013, -0.31] };
    const o = alignKitToBodyOffset(body, kit);
    assert.ok(Math.abs(o.y - 0.35) < 0.001);
  });

  it('aligns obj_veh floors when both near Y=0', () => {
    const body = { min: [-1.77, -0.238, -2.64] };
    const kit = { min: [-0.28, -0.013, -0.31] };
    const o = alignKitToBodyOffset(body, kit);
    assert.ok(Math.abs(o.y - (-0.225)) < 0.001);
  });
});

describe('weaponMeshLocalOffset', () => {
  it('seats mount corner at hardpoint', () => {
    const o = weaponMeshLocalOffset({
      min: [-0.05, -0.05, 0.25],
      max: [0.05, 0.17, 1.01],
    });
    assert.equal(o.y, 0.05);
    assert.equal(o.z, -0.25);
  });
});

describe('integration — equipment-catalog.json', { skip: !catalog }, () => {
  it('Callisto X has three hardpoints', () => {
    const v = catalog.Vehicles.find((x) => x.UniqueName.includes('dune-buggy-newuser'));
    assert.ok(v);
    assert.equal(v.HardPoints.length, 3);
    assert.equal(v.VehicleFlags, 22);
  });

  it('listCompatibleParts returns turret weapons for Callisto', () => {
    const v = catalog.Vehicles.find((x) => x.UniqueName.includes('dune-buggy-newuser'));
    const parts = listCompatibleParts(catalog, v.Cbid, 'turret');
    assert.ok(parts.length > 0);
    assert.ok(parts.some((p) => p.compatible && p.CanBeTurret));
  });

  it('default loadout picks default wheelset cbid', () => {
    const v = catalog.Vehicles.find((x) => x.UniqueName.includes('dune-buggy-newuser'));
    const loadout = defaultLoadoutForVehicle(catalog, v.Cbid);
    assert.equal(loadout.wheelset, v.DefaultWheelset);
  });

  it('Pike Hitman has no turret-compatible weapons in turret slot', () => {
    const v = catalog.Vehicles.find((x) => x.UniqueName.includes('pik_c_cha_01_tank') || x.ShortDesc === 'Pike Hitman');
    assert.ok(v);
    assert.equal(v.VehicleFlags, 6);
    const parts = listCompatibleParts(catalog, v.Cbid, 'turret');
    assert.equal(parts.filter((p) => p.compatible).length, 0);
  });
});
