import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPalDiffMapEffect } from './materials-lib.js';

describe('materials-paldiffmap', () => {
  it('isPalDiffMapEffect matches PalDiffMap shader names', () => {
    assert.equal(isPalDiffMapEffect('PalDiffMapNorMap.fx'), true);
    assert.equal(isPalDiffMapEffect('PalDiffMap.fx'), true);
    assert.equal(isPalDiffMapEffect('NDHumanCar.fx'), false);
    assert.equal(isPalDiffMapEffect(''), false);
    assert.equal(isPalDiffMapEffect(null), false);
  });
});
