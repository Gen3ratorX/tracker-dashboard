const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAuthMiddleware } = require('../src/server/middleware/auth');
const { createValidateLocationMiddleware } = require('../src/server/middleware/validateLocation');
const { createInMemoryRateLimit } = require('../src/server/middleware/rateLimit');
const { LocationStore } = require('../src/server/services/locationStore');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('auth middleware enforces X-Tracker-Token when configured', () => {
  const auth = createAuthMiddleware('secret-token');
  const req = {
    get(name) {
      if (name === 'X-Tracker-Token') {
        return undefined;
      }
      return undefined;
    },
  };
  const res = mockRes();
  let nextCalled = false;

  auth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

test('validation middleware accepts valid payload and normalizes values', () => {
  const validate = createValidateLocationMiddleware();
  const req = {
    body: {
      lat: '5.6037',
      lng: '-0.1870',
      spd: '10.5',
      sats: 8,
      deviceTime: '2026-02-28T12:00:00.000Z',
    },
  };
  const res = mockRes();
  let nextCalled = false;

  validate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.validatedLocation, {
    lat: 5.6037,
    lng: -0.187,
    spd: 10.5,
    sats: 8,
    deviceTime: '2026-02-28T12:00:00.000Z',
  });
});

test('validation middleware rejects out-of-range latitude', () => {
  const validate = createValidateLocationMiddleware();
  const req = { body: { lat: 140, lng: 20 } };
  const res = mockRes();

  validate(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.field, 'lat');
});

test('rate limiter blocks requests above configured threshold', () => {
  const limiter = createInMemoryRateLimit({ windowMs: 60_000, maxRequests: 2 });
  const req = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };

  const res1 = mockRes();
  let call1 = false;
  limiter(req, res1, () => {
    call1 = true;
  });

  const res2 = mockRes();
  let call2 = false;
  limiter(req, res2, () => {
    call2 = true;
  });

  const res3 = mockRes();
  let call3 = false;
  limiter(req, res3, () => {
    call3 = true;
  });

  assert.equal(call1, true);
  assert.equal(call2, true);
  assert.equal(call3, false);
  assert.equal(res3.statusCode, 429);
});

test('location store persists latest point across restart', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-store-'));
  const filePath = path.join(dir, 'locations.jsonl');

  const store1 = new LocationStore(filePath);
  store1.initSync();
  await store1.append({
    lat: 1.234,
    lng: 5.678,
    spd: 12.3,
    sats: 9,
    deviceTime: null,
    receivedAt: '2026-02-28T10:00:00.000Z',
  });

  const store2 = new LocationStore(filePath);
  store2.initSync();
  const latest = store2.getLatest();

  assert.equal(latest.hasFix, true);
  assert.equal(latest.lat, 1.234);
  assert.equal(latest.lng, 5.678);

  const history = await store2.getHistory(10);
  assert.equal(history.length, 1);
});
