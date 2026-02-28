function createAuthMiddleware(trackerToken) {
  return function authMiddleware(req, res, next) {
    if (!trackerToken) {
      return next();
    }

    const token = req.get('X-Tracker-Token');
    if (!token || token !== trackerToken) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Missing or invalid X-Tracker-Token header',
      });
    }

    return next();
  };
}

module.exports = {
  createAuthMiddleware,
};
