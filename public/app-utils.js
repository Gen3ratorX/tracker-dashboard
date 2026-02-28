(function attachUtils(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.DashboardUtils = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  function buildMapsUrl(lat, lng) {
    return `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
  }

  function deriveStatusFromAge(ageMs) {
    if (ageMs == null || Number.isNaN(ageMs) || ageMs > 60000) {
      return { state: 'offline', text: 'Server Offline' };
    }

    if (ageMs > 15000) {
      return { state: 'stale', text: 'Tracker Stale' };
    }

    return { state: 'online', text: 'Tracker Live' };
  }

  function nextTransportMode(streamHealthy) {
    return streamHealthy ? 'sse' : 'polling';
  }

  return {
    buildMapsUrl,
    deriveStatusFromAge,
    nextTransportMode,
  };
}));
