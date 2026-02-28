const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMapsUrl,
  deriveStatusFromAge,
  nextTransportMode,
} = require('../public/app-utils');

test('buildMapsUrl renders valid Google Maps URL', () => {
  const url = buildMapsUrl(5.603717, -0.186964);
  assert.equal(url, 'https://www.google.com/maps?q=5.603717,-0.186964');
});

test('deriveStatusFromAge follows online/stale/offline thresholds', () => {
  assert.deepEqual(deriveStatusFromAge(1000), { state: 'online', text: 'Tracker Live' });
  assert.deepEqual(deriveStatusFromAge(20000), { state: 'stale', text: 'Tracker Stale' });
  assert.deepEqual(deriveStatusFromAge(70000), { state: 'offline', text: 'Server Offline' });
  assert.deepEqual(deriveStatusFromAge(null), { state: 'offline', text: 'Server Offline' });
});

test('nextTransportMode uses polling fallback when stream unhealthy', () => {
  assert.equal(nextTransportMode(true), 'sse');
  assert.equal(nextTransportMode(false), 'polling');
});
