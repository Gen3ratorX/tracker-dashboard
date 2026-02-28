const express = require('express');

function clampLimit(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function createLocationRouter({ store, sseBroker, auth, validateLocation, updateRateLimit }) {
  const router = express.Router();

  router.post('/update-location', updateRateLimit, auth, validateLocation, async (req, res, next) => {
    try {
      const receivedAt = new Date().toISOString();
      const location = {
        ...req.validatedLocation,
        receivedAt,
      };

      await store.append(location);
      sseBroker.broadcast('location', { ...location, hasFix: true });

      res.status(200).json({ ok: true, receivedAt });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/location', (req, res) => {
    res.json(store.getLatest());
  });

  router.get('/api/location/history', async (req, res, next) => {
    try {
      const limit = clampLimit(req.query.limit, 200, 1, 5000);
      const history = await store.getHistory(limit);
      res.json({ ok: true, limit, count: history.length, items: history });
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/location/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    res.write('event: connected\ndata: {"ok":true}\n\n');

    const latest = store.getLatest();
    if (latest.hasFix) {
      res.write(`event: location\ndata: ${JSON.stringify(latest)}\n\n`);
    }

    const heartbeat = setInterval(() => {
      res.write('event: heartbeat\ndata: {}\n\n');
    }, 30000);

    sseBroker.addClient(res);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseBroker.removeClient(res);
      res.end();
    });
  });

  router.get('/health', (req, res) => {
    const latest = store.getLatest();
    const now = Date.now();
    const lastUpdateAgeMs = latest.receivedAt ? now - new Date(latest.receivedAt).getTime() : null;

    res.json({
      status: 'ok',
      uptimeSec: Number(process.uptime().toFixed(1)),
      hasFix: latest.hasFix,
      lastUpdateAgeMs,
    });
  });

  return router;
}

module.exports = {
  createLocationRouter,
};
