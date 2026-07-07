import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nameCandidates, resolveModelPath, buildModelStemMap } from './model-resolve.js';

describe('model-resolve', () => {
  const modelByStem = buildModelStemMap([
    { name: 'obj_mnt_n_snag_tree_01_pine-yellowish_dead.geo', path: 'assets/extracted/models/obj_mnt_n_snag_tree_01_pine-yellowish_dead.geo' },
    { name: 'obj_f_h_static_str_01_building-pieces-wall-plain.geo', path: 'assets/extracted/models/obj_f_h_static_str_01_building-pieces-wall-plain.geo' },
    { name: 'obj_mnt_n_snag_tree_01_ash_stump.geo', path: 'assets/extracted/models/obj_mnt_n_snag_tree_01_ash_stump.geo' },
  ]);

  it('nameCandidates generates hyphen and underscore variants', () => {
    const c = nameCandidates('obj_mnt_n_snag_tree_01_pine-yellowish-dead');
    assert.ok(c.includes('obj_mnt_n_snag_tree_01_pine-yellowish-dead'));
    assert.ok(c.includes('obj_mnt_n_snag_tree_01_pine_yellowish_dead'));
    assert.ok(c.some((n) => n.includes('pine-yellowish_dead') || n.includes('pine_yellowish_dead')));
  });

  it('resolves tree dead suffix mismatch', () => {
    const path = resolveModelPath({
      Unique: 'obj_mnt_n_snag_tree_01_pine-yellowish-dead',
      Physics: null,
      Short: null,
    }, modelByStem);
    assert.ok(path?.includes('pine-yellowish_dead'));
  });

  it('resolves exact building name', () => {
    const path = resolveModelPath({
      Unique: 'obj_f_h_static_str_01_building-pieces-wall-plain',
    }, modelByStem);
    assert.ok(path?.includes('building-pieces-wall-plain'));
  });

  it('returns null when no match', () => {
    assert.equal(resolveModelPath({ Unique: 'totally_missing_object_xyz' }, modelByStem), null);
  });
});
