// -----------------------------------------------------------------------------
// The county of a house, guessed from its coordinates (counties.js).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTIES, TOWNS, countyOf, resolveCounty } from '../src/counties.js';
import { loadFixture } from './helpers/fixtures.js';

test('the 26 counties, with their FIPS codes', () => {
  assert.equal(Object.keys(COUNTIES).length, 26);
  for (const code of Object.keys(COUNTIES)) {
    assert.ok(
      TOWNS.some(([town]) => town === code),
      `${code} has towns`,
    );
  }
});

test('every county code of the real warnings is known', () => {
  for (const warning of loadFixture('real-warnings-ireland.json')) {
    for (const region of warning.regions) {
      assert.ok(Object.hasOwn(COUNTIES, region), region);
    }
  }
});

test('the headline of the real single-county warnings names the county of the code', () => {
  for (const warning of loadFixture('real-warnings-ireland.json')) {
    if (warning.regions.length === 1) {
      assert.match(warning.headline, new RegExp(`for ${COUNTIES[warning.regions[0]]}$`));
    }
  }
});

test('cities and villages land in their county', () => {
  const places = [
    [53.3498, -6.2603, 'EI07'], // Dublin
    [51.8985, -8.4756, 'EI04'], // Cork
    [53.2707, -9.0568, 'EI10'], // Galway
    [52.6638, -8.6267, 'EI16'], // Limerick
    [52.2593, -7.1101, 'EI27'], // Waterford
    [54.9558, -7.7342, 'EI06'], // Letterkenny
    [52.0599, -9.5044, 'EI11'], // Killarney
    [53.7179, -6.3561, 'EI19'], // Drogheda
    [53.5259, -7.3381, 'EI29'], // Mullingar
    [52.1409, -10.2681, 'EI11'], // Dingle
    [53.1155, -9.6704, 'EI10'], // Inis Mór
    [51.62, -9.0, 'EI04'], // Rosscarbery
    [54.15, -6.95, 'EI22'], // near Castleblayney
  ];
  for (const [latitude, longitude, code] of places) {
    assert.equal(countyOf(latitude, longitude), code, `${latitude}, ${longitude}`);
  }
});

test('Northern Ireland and anywhere abroad have no county', () => {
  assert.equal(countyOf(54.597, -5.93), null); // Belfast
  assert.equal(countyOf(54.997, -7.309), null); // Derry
  assert.equal(countyOf(48.8566, 2.3522), null); // Paris
  assert.equal(countyOf(51.5074, -0.1278), null); // London
  assert.equal(countyOf(Number.NaN, 0), null);
});

test('the setting wins over the guess', () => {
  assert.equal(resolveCounty('EI11', 53.3498, -6.2603), 'EI11');
  assert.equal(resolveCounty('auto', 53.3498, -6.2603), 'EI07');
  assert.equal(resolveCounty('nonsense', 53.3498, -6.2603), 'EI07');
});
