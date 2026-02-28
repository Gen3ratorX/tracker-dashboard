const express = require('express');
const cors = require('cors');
const path = require('node:path');

const { LocationStore } = require('./services/locationStore');
const { SseBroker } = require('./services/sseBroker');
const { createAuthMiddleware } = require('./middleware/auth');
const { createValidateLocationMiddleware } = require('./middleware/validateLocation');
const { createInMemoryRateLimit } = require('./middleware/rateLimit');
const { createLocationRouter } = require('./routes/location');

function createCorsOptions(corsOrigin) {
  if (!corsOrigin || corsOrigin === '*') {
    return { origin: true };
  }

  const allowed = corsOrigin
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
  };
}

function attachSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
}

function createApp(options = {}) {
  const app = express();

  const config = {
    trackerToken: options.trackerToken ?? process.env.TRACKER_TOKEN ?? '',
    corsOrigin: options.corsOrigin ?? process.env.CORS_ORIGIN ?? '*',
    dataFile: options.dataFile ?? process.env.LOCATION_LOG_FILE ?? path.join(process.cwd(), 'data', 'locations.jsonl'),
    bodyLimit: options.bodyLimit ?? process.env.BODY_LIMIT ?? '100kb',
    rateWindowMs: Number(options.rateWindowMs ?? process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateMaxRequests: Number(options.rateMaxRequests ?? process.env.RATE_LIMIT_MAX_REQUESTS ?? 120),
  };

  const store = new LocationStore(config.dataFile);
  const sseBroker = new SseBroker();
  store.initSync();

  app.set('trust proxy', true);

  app.use(attachSecurityHeaders);
  app.use(cors(createCorsOptions(config.corsOrigin)));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
  });

  const auth = createAuthMiddleware(config.trackerToken);
  const validateLocation = createValidateLocationMiddleware();
  const updateRateLimit = createInMemoryRateLimit({
    windowMs: config.rateWindowMs,
    maxRequests: config.rateMaxRequests,
  });

  app.use(
    createLocationRouter({
      store,
      sseBroker,
      auth,
      validateLocation,
      updateRateLimit,
    }),
  );

  app.use(express.static(path.join(process.cwd(), 'public')));
  app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    console.error('[ERROR]', err);
    res.status(500).json({ ok: false, error: 'internal_error', message: 'Unexpected server error' });
  });

  return { app, store, sseBroker, config };
}

module.exports = {
  createApp,
};
