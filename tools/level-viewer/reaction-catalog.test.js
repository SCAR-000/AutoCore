import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REACTION_TYPE_COUNT,
  REACTION_CATALOG_GHIDRA,
  getAllReactionTypes,
  getReactionTypeInfo,
  inferRealmFromCatalog,
  buildCatalogDetailLines,
  formatCatalogField,
} from './reaction-catalog.js';

const EXPECTED_NAMES = [
  'Activate', 'Deactivate', 'Create', 'Delete', 'MakeFriend', 'MakeEnemy', 'MakeInvincible',
  'MakeNotInvincbile', 'Death', 'TakeArena', 'TransferMap', 'ClientText', 'SkillCast',
  'VariableSet', 'VariableAdd', 'VariableSub', 'Enable', 'Disable', 'Text', 'ResetTrigger',
  'SetFaction', 'ResetFaction', 'SetFactionFromVar', 'SetHP', 'Boost', 'RemoveFromInv',
  'AdjustCredits', 'AddSkillPoints', 'AddXP', 'MarkRepairStation', 'GiveMission', 'CompleteObjective',
  'UnlockContObj', 'AddMissionString', 'DelMissionString', 'AddWaypoint', 'DelWaypoint',
  'GiveMissionDialog', 'GiveItemNumCBID', 'GiveItemNumCBIDGen', 'OpenBodyShop', 'OpenRefinery',
  'OpenGarage', 'SetPath', 'SetPatrolDistance', 'Teleport', 'TimerStart', 'TimerStop',
  'VariableSetRandom', 'VariableMul', 'VariableDiv', 'GiveMedal', 'OpenStore', 'SetTeamFaction',
  'ResetTeamFaction', 'SetTeamFactionFromVar', 'AddPoints', 'ResetPoints', 'OpenArena',
  'OpenClanManager', 'SetActiveObjective', 'ProgressBar', 'SetMapWaypoint', 'SetMapDynamicWaypoint',
  'SetStatusText', 'SetProgressBar', 'RemoveProgressBar', 'RemoveText', 'RemoveMapWaypoint',
  'RemoveMapDynamicWaypoint', 'RelockContObj', 'OpenSkillTrainer', 'FailMission', 'SpawnCollide',
  'FirstTimeEvent', 'OpenDialog', 'PlayMusic', 'Path', 'CaptureOutpost', 'SetLevel', 'GiveRespec',
  'RollFromLootTable', 'TimerPause', 'TaxiStops', 'RaceWaypointReached', 'StartRaceTimer',
  'OpenMailBox', 'OpenAuctionHouse',
];

describe('reaction-catalog', () => {
  it('covers all 88 ReactionType enum values in order', () => {
    assert.equal(REACTION_TYPE_COUNT, 88);
    const types = getAllReactionTypes();
    assert.equal(types.length, 88);
    types.forEach((t, i) => {
      assert.equal(t.id, i, `id mismatch at index ${i}`);
      assert.equal(t.name, EXPECTED_NAMES[i]);
      assert.ok(t.summary, `${t.name} missing summary`);
      assert.ok(t.realm, `${t.name} missing realm`);
      assert.ok(t.ghidra?.dispatchCase === i, `${t.name} dispatchCase`);
    });
  });

  it('documents Ghidra dispatch address', () => {
    assert.equal(REACTION_CATALOG_GHIDRA.dispatch, '0x0057c500');
    assert.equal(REACTION_CATALOG_GHIDRA.dispatchSymbol, 'CVOGReaction_Dispatch');
  });

  it('lookup by name and id', () => {
    const m = getReactionTypeInfo('MarkRepairStation');
    assert.equal(m?.id, 29);
    assert.match(m?.summary ?? '', /repair station/i);
    assert.equal(getReactionTypeInfo(72)?.name, 'FailMission');
    assert.equal(getReactionTypeInfo('99'), null);
  });

  it('priority types have field bindings', () => {
    for (const name of ['CompleteObjective', 'VariableSetRandom', 'Death', 'Text']) {
      const info = getReactionTypeInfo(name);
      assert.ok(info?.fields && Object.keys(info.fields).length > 0, name);
    }
  });

  it('inferRealmFromCatalog respects catalog realm', () => {
    assert.equal(inferRealmFromCatalog({ ReactionType: 'Text' })?.id, 'client');
    assert.equal(inferRealmFromCatalog({ ReactionType: 'Delete' })?.id, 'server');
    assert.equal(
      inferRealmFromCatalog({ ReactionType: 'Text', DoForAllPlayers: true })?.id,
      'server-broadcast',
    );
  });

  it('buildCatalogDetailLines includes description and status', () => {
    const lines = buildCatalogDetailLines(
      { ReactionType: 'MarkRepairStation', GenericVar1: 3 },
      [{ Id: 3, Name: 'station_a' }],
    );
    assert.ok(lines.some((l) => /INC airlift|repair station/i.test(l)));
    assert.ok(lines.some((l) => /tier-a/i.test(l)));
  });

  it('formatCatalogField resolves variable names', () => {
    const info = getReactionTypeInfo('VariableSet');
    const s = formatCatalogField(info, 'GenericVar1', 7, [{ Id: 7, Name: 'gate_open' }]);
    assert.match(s ?? '', /gate_open/);
  });
});
