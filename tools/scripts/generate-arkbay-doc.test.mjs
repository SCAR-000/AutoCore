import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadLevel,
  triggerGroup,
  formatConditions,
  generate,
} from './generate-arkbay-doc.mjs';

const level = loadLevel();

test('arkbay level counts', () => {
  assert.equal(level.Name, 'sec_f_h_map_tut_j2_arkbaytutorial');
  assert.equal(level.Triggers.length, 206);
  assert.equal(level.Reactions.length, 376);
  assert.equal(level.MapLogic.Variables.length, 88);
});

test('trigger grouping', () => {
  const city = level.Triggers.filter((t) => triggerGroup(t.Name) === 'city');
  const tsp = level.Triggers.filter((t) => triggerGroup(t.Name) === 'tsp');
  const tutorial = level.Triggers.filter((t) => triggerGroup(t.Name) === 'tutorial');
  assert.equal(city.length, 103);
  assert.equal(tsp.length, 5);
  assert.equal(tutorial.length, 98);
});

test('critical COIDs exist', () => {
  const coids = new Set(level.Triggers.map((t) => t.Coid));
  for (const id of [16217, 16221, 15835, 14130, 16590]) {
    assert.ok(coids.has(id), `missing trigger ${id}`);
  }
});

test('per-player load trigger fires GiveMission 554', () => {
  const load = level.Triggers.find((t) => t.Coid === 16217);
  const rx = Object.fromEntries(level.Reactions.map((r) => [r.Coid, r]));
  assert.ok(load.Reactions.includes(14137));
  assert.equal(rx[14137].ReactionType, 'GiveMission');
  assert.equal(rx[14137].GenericVar1, 554);
});

test('exit trigger requires l0_gunnyhealed', () => {
  const exit = level.Triggers.find((t) => t.Coid === 15835);
  const varMap = Object.fromEntries(level.MapLogic.Variables.map((v) => [v.Id, v]));
  const cond = formatConditions(exit.Conditions, varMap);
  assert.match(cond, /l0_gunnyhealed/);
});

test('generate patches doc when markers present', () => {
  const result = generate();
  assert.equal(result.level.Triggers.length, 206);
  assert.equal(result.patched, true);
});
