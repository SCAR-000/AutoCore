import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferReactionExecutionRealm, realmBadgeClass, CLIENT_UI_REACTION_TYPES } from './reaction-execution.js';

describe('reaction-execution', () => {
  it('ClientText is client UI', () => {
    const r = inferReactionExecutionRealm({ ReactionType: 'ClientText' });
    assert.equal(r.id, 'client');
    assert.match(r.label, /Client UI/i);
  });

  it('Text with TargetType Client is client UI', () => {
    const r = inferReactionExecutionRealm({
      ReactionType: 'Text',
      Text: { TargetType: 'Client', Main: 'Hello' },
    });
    assert.equal(r.id, 'client');
  });

  it('Text with TargetType Convoy is convoy client UI', () => {
    const r = inferReactionExecutionRealm({
      ReactionType: 'Text',
      Text: { TargetType: 'Convoy' },
    });
    assert.equal(r.id, 'client-convoy');
  });

  it('VariableSet is server authoritative', () => {
    const r = inferReactionExecutionRealm({ ReactionType: 'VariableSet' });
    assert.equal(r.id, 'server');
    assert.match(r.label, /Server/i);
  });

  it('DoForAllPlayers overrides to server broadcast', () => {
    const r = inferReactionExecutionRealm({
      ReactionType: 'ClientText',
      DoForAllPlayers: true,
    });
    assert.equal(r.id, 'server-broadcast');
  });

  it('OpenStore is client UI', () => {
    assert.ok(CLIENT_UI_REACTION_TYPES.has('OpenStore'));
    assert.equal(inferReactionExecutionRealm({ ReactionType: 'OpenStore' }).id, 'client');
  });

  it('realmBadgeClass maps client and server ids', () => {
    assert.match(realmBadgeClass({ id: 'client', label: '' }), /client/);
    assert.match(realmBadgeClass({ id: 'server', label: '' }), /server/);
  });
});
