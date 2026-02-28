function createInMemoryRateLimit({ windowMs, maxRequests }) {
  const requestBuckets = new Map();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const bucket = requestBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        ok: false,
        error: 'rate_limit',
        message: 'Too many requests',
        retryAfterMs: bucket.resetAt - now,
      });
    }

    bucket.count += 1;
    return next();
  };
}

module.exports = {
  createInMemoryRateLimit,
};
