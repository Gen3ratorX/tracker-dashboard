function toFiniteNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function validateDeviceTime(value) {
  if (value == null || value === '') {
    return { ok: true, normalized: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, reason: 'deviceTime must be an ISO timestamp string' };
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return { ok: false, reason: 'deviceTime must be a valid timestamp' };
  }

  return { ok: true, normalized: asDate.toISOString() };
}

function createValidateLocationMiddleware() {
  return function validateLocation(req, res, next) {
    const lat = toFiniteNumber(req.body.lat);
    const lng = toFiniteNumber(req.body.lng);
    const spdRaw = req.body.spd;
    const satsRaw = req.body.sats;

    if (lat == null || lat < -90 || lat > 90) {
      return res.status(400).json({ ok: false, error: 'validation_error', field: 'lat', message: 'lat must be a number between -90 and 90' });
    }

    if (lng == null || lng < -180 || lng > 180) {
      return res.status(400).json({ ok: false, error: 'validation_error', field: 'lng', message: 'lng must be a number between -180 and 180' });
    }

    const spd = spdRaw == null ? 0 : toFiniteNumber(spdRaw);
    if (spd == null || spd < 0 || spd > 400) {
      return res.status(400).json({ ok: false, error: 'validation_error', field: 'spd', message: 'spd must be a number between 0 and 400' });
    }

    const sats = satsRaw == null ? 0 : toFiniteNumber(satsRaw);
    if (sats == null || sats < 0 || sats > 100 || !Number.isInteger(sats)) {
      return res.status(400).json({ ok: false, error: 'validation_error', field: 'sats', message: 'sats must be an integer between 0 and 100' });
    }

    const deviceTimeCheck = validateDeviceTime(req.body.deviceTime);
    if (!deviceTimeCheck.ok) {
      return res.status(400).json({ ok: false, error: 'validation_error', field: 'deviceTime', message: deviceTimeCheck.reason });
    }

    req.validatedLocation = {
      lat,
      lng,
      spd,
      sats,
      deviceTime: deviceTimeCheck.normalized,
    };

    return next();
  };
}

module.exports = {
  createValidateLocationMiddleware,
};
