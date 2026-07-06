import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTriggerGraph, buildTriggerPanelHTML, buildTriggerInspectorHTML, buildReactionDetailHTML, lookupReaction, getTriggers, formatCoid, triggerWireframeColorNote, buildTriggerTooltipHTML, triggerEffectiveRenderRgb, TRIGGER_WIREFRAME_MATERIAL_RGB } from './trigger-graph.js';
import { isTrigger, countTriggers, markerKindInfo, MARKER_KIND_INFO, pickTriggerHit } from './level-visibility.js';

describe('level-visibility', () => {
  it('isTrigger detects legacy Object Type=Trigger', () => {
    assert.equal(isTrigger({ Type: 'Trigger' }), true);
    assert.equal(isTrigger({ Type: 'Object' }), false);
  });

  it('isTrigger detects dedicated Triggers array entries', () => {
    assert.equal(isTrigger({ TargetType: 'Players', Reactions: [] }), true);
  });

  it('countTriggers prefers Triggers array', () => {
    assert.equal(countTriggers({ Triggers: [{}, {}], Objects: [{ Type: 'Trigger' }] }), 2);
  });

  it('markerKindInfo describes green spawn and yellow store spheres', () => {
    const spawn = markerKindInfo('spawn');
    assert.match(spawn.description, /Green sphere/i);
    assert.match(spawn.description, /spawn/i);
    assert.equal(spawn.color, MARKER_KIND_INFO.spawn.color);

    const store = markerKindInfo('store');
    assert.match(store.description, /Yellow sphere/i);
    assert.match(store.description, /vendor|junkyard|garage/i);
  });

  it('triggerWireframeColorNote explains green vs orange trigger wireframes', () => {
    assert.match(triggerWireframeColorNote({ Color: 0x00ff00, TargetType: 'List' }), /Green wireframe/i);
    assert.match(triggerWireframeColorNote({ Color: 0, TargetType: 'Players' }), /Orange wireframe/i);
    assert.match(triggerWireframeColorNote({ Color: 0xffffff, TargetType: 'Players' }), /Orange\/yellow wireframe/i);
    assert.match(triggerWireframeColorNote({ Color: 0xffff00, TargetType: 'Players' }), /Orange\/yellow wireframe/i);
  });

  it('triggerEffectiveRenderRgb multiplies white editor tint with orange material', () => {
    assert.equal(triggerEffectiveRenderRgb({ Color: 0xffffff }), TRIGGER_WIREFRAME_MATERIAL_RGB);
    assert.equal(triggerEffectiveRenderRgb({ Color: 0 }), TRIGGER_WIREFRAME_MATERIAL_RGB);
  });

  it('pickTriggerHit prefers smallest nested trigger, then later instance', () => {
    const mkHit = (instanceId, scale) => {
      const objs = [];
      objs[instanceId] = { _category: 'trigger', Scale: scale };
      return { instanceId, object: { userData: { objs } } };
    };
    const hits = [mkHit(0, 50), mkHit(3, 10), mkHit(1, 10)];
    const get = (h) => h.object.userData.objs[h.instanceId];
    assert.equal(pickTriggerHit(hits, get).instanceId, 3);
    assert.equal(pickTriggerHit(hits.slice(0, 1), get).instanceId, 0);
    assert.equal(pickTriggerHit([], get), null);
  });

  it('buildTriggerTooltipHTML includes wireframe note and activates-for', () => {
    const html = buildTriggerTooltipHTML({ Color: 0x00ff00, TargetType: 'Vehicles', Scale: 10 });
    assert.match(html, /Green wireframe/i);
    assert.match(html, /activates for/i);
    assert.match(html, /vehicle/i);
  });
});

describe('trigger-graph', () => {
  it('formatCoid resolves ObjectIndex labels', () => {
    const label = formatCoid(5, { 5: { Kind: 'spawn', Label: 'Spawner A' } });
    assert.match(label, /Spawner A/);
    assert.match(label, /#5/);
  });

  it('resolveTriggerGraph detects cycles client-side', () => {
    const trigger = { Coid: 1, Reactions: [10] };
    const data = {
      Reactions: [
        { Coid: 10, ReactionType: 'Activate', Reactions: [10], Objects: [] },
      ],
      ObjectIndex: {},
      MapLogic: { Variables: [] },
    };
    const graph = resolveTriggerGraph(trigger, data);
    assert.equal(graph.Nodes[0].Children[0].IsCycle, true);
  });

  it('buildTriggerPanelHTML includes reaction summary', () => {
    const trigger = {
      Coid: 1,
      Cbid: 2,
      Name: 'Zone Gate',
      TargetType: 'Players',
      Scale: 12,
      Reactions: [50],
      Graph: {
        Nodes: [{
          Coid: 50,
          ReactionType: 'TransferMap',
          Summary: 'Transfer map (ContinentObject) data=3',
          Details: [],
          TargetCoids: [],
          Children: [],
          IsCycle: false,
        }],
      },
    };
    const data = {
      ObjectIndex: {},
      MapLogic: { Variables: [] },
      Reactions: [{ Coid: 50, ReactionType: 'TransferMap', Objects: [] }],
    };
    const html = buildTriggerPanelHTML(trigger, data);
    assert.match(html, /Zone Gate/);
    assert.match(html, /TransferMap/);
    assert.match(html, /tp-realm/);
    assert.match(html, /data-reaction-coid="50"/);
  });

  it('buildTriggerInspectorHTML marks selected reaction node', () => {
    const trigger = {
      Coid: 1,
      Graph: {
        Nodes: [{
          Coid: 50,
          ReactionType: 'VariableSet',
          Summary: 'Set var',
          Details: [],
          TargetCoids: [],
          Children: [],
          IsCycle: false,
        }],
      },
    };
    const data = {
      ObjectIndex: {},
      MapLogic: { Variables: [] },
      Reactions: [{ Coid: 50, ReactionType: 'VariableSet', Objects: [] }],
    };
    const html = buildTriggerInspectorHTML(trigger, data, { selectedReactionCoid: 50 });
    assert.match(html, /tp-node-select selected/);
  });

  it('buildReactionDetailHTML includes Text choices and trigger links', () => {
    const data = {
      ObjectIndex: { 9: { Kind: 'spawn', Label: 'Spawner' } },
      MapLogic: { Variables: [] },
      Reactions: [{
        Coid: 77,
        Cbid: 1,
        ReactionType: 'Text',
        Text: {
          Type: 'Dialog',
          TargetType: 'Client',
          Main: 'Pick one',
          Choices: [{ Text: 'Go', TriggerCoid: 42 }, { Text: 'Stay', TriggerCoid: 0 }],
        },
        Objects: [9],
      }],
    };
    const html = buildReactionDetailHTML(77, data);
    assert.match(html, /Client/);
    assert.match(html, /Dialog/);
    assert.match(html, /tp-trigger-link/);
    assert.match(html, /data-trigger-coid="42"/);
    assert.match(html, /tp-focus/);
  });

  it('lookupReaction finds reaction by COID', () => {
    const data = { Reactions: [{ Coid: 99, ReactionType: 'Text' }] };
    assert.equal(lookupReaction(data, 99)?.ReactionType, 'Text');
    assert.equal(lookupReaction(data, 100), null);
  });

  it('lookupTrigger resolves by index and coid', () => {
    const data = {
      Triggers: [{ Coid: 5, Name: 'A', Reactions: [99], Graph: { Nodes: [{ Coid: 99, ReactionType: 'Text', Summary: 'hi', Details: [], TargetCoids: [], Children: [], IsCycle: false }] } }],
      Reactions: [{ Coid: 99, ReactionType: 'Text', Objects: [] }],
    };
    const hint = { Coid: 5, _triggerIndex: 0, _category: 'trigger' };
    const html = buildTriggerPanelHTML(hint, data);
    assert.match(html, /Text/);
    assert.doesNotMatch(html, /No reactions linked to this trigger/);
  });

  it('getTriggers prefers dedicated array', () => {
    const legacy = [{ Type: 'Trigger', Coid: 1 }];
    const modern = [{ Coid: 2, Name: 'T2', Reactions: [] }];
    assert.equal(getTriggers({ Triggers: modern, Objects: legacy }).length, 1);
    assert.equal(getTriggers({ Objects: legacy }).length, 1);
  });
});
