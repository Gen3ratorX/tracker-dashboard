const { buildMapsUrl, deriveStatusFromAge, nextTransportMode } = window.DashboardUtils;

const ONLINE_THRESHOLD_MS = 15000;
const OFFLINE_THRESHOLD_MS = 60000;
const POLLING_MS = 5000;
const MAX_TRAIL_POINTS = 2000;

const state = {
  trailOn: false,
  trailHistory: [],
  mapInitialized: false,
  lastPos: null,
  lastReceivedAt: null,
  connectionMode: 'sse',
  pollingTimer: null,
  statusTicker: null,
  stream: null,
};

const elements = {
  statusPill: document.getElementById('statusPill'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  lastUpdate: document.getElementById('last-update'),
  speedVal: document.getElementById('speedVal'),
  satsVal: document.getElementById('satsVal'),
  hdopVal: document.getElementById('hdopVal'),
  latVal: document.getElementById('latVal'),
  lngVal: document.getElementById('lngVal'),
  trailBtn: document.getElementById('trailBtn'),
  mapsLink: document.getElementById('mapsLink'),
  alertToast: document.getElementById('alertToast'),
};

const carIcon = L.divIcon({
  html: '<div class="car-pin">🚘</div>',
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap',
}).addTo(map);

const marker = L.marker([0, 0], { icon: carIcon });
const polyline = L.polyline([], { color: '#00c853', weight: 4 }).addTo(map);

function setStatus(stateName, text) {
  elements.statusPill.className = `status-pill ${stateName}`;
  elements.statusDot.className = `dot${stateName === 'online' ? ' pulse' : ''}`;
  elements.statusText.textContent = text;
}

function renderAge() {
  if (!state.lastReceivedAt) {
    setStatus('offline', 'Awaiting GPS Fix');
    elements.lastUpdate.textContent = 'No data yet';
    return;
  }

  const ageMs = Date.now() - new Date(state.lastReceivedAt).getTime();
  const status = deriveStatusFromAge(ageMs);

  // Enforce thresholds in UI state.
  if (ageMs <= ONLINE_THRESHOLD_MS) {
    setStatus('online', status.text);
  } else if (ageMs <= OFFLINE_THRESHOLD_MS) {
    setStatus('stale', status.text);
  } else {
    setStatus('offline', status.text);
  }

  const agoSec = Math.max(0, Math.floor(ageMs / 1000));
  const localTime = new Date(state.lastReceivedAt).toLocaleString();
  elements.lastUpdate.textContent = `Updated ${agoSec}s ago (${localTime})`;
}

function showAlert(message) {
  elements.alertToast.textContent = message;
  elements.alertToast.classList.add('show');
  setTimeout(() => elements.alertToast.classList.remove('show'), 3000);
}

function updateTrail(latLng) {
  if (!state.trailOn) {
    return;
  }

  state.trailHistory.push(latLng);
  if (state.trailHistory.length > MAX_TRAIL_POINTS) {
    state.trailHistory.splice(0, state.trailHistory.length - MAX_TRAIL_POINTS);
  }
  polyline.setLatLngs(state.trailHistory);
}

function updateMap(lat, lng) {
  const latLng = [lat, lng];

  if (!state.mapInitialized) {
    marker.setLatLng(latLng).addTo(map);
    map.setView(latLng, 16);
    state.mapInitialized = true;
  } else {
    marker.setLatLng(latLng);
    map.panTo(latLng);
  }

  updateTrail(latLng);

  if (state.lastPos) {
    const movement = Math.abs(lat - state.lastPos.lat) + Math.abs(lng - state.lastPos.lng);
    if (movement > 0.0005) {
      showAlert('Movement detected!');
    }
  }

  state.lastPos = { lat, lng };
}

function updateUI(data) {
  if (!data.hasFix) {
    return;
  }

  const lat = Number(data.lat);
  const lng = Number(data.lng);
  const spd = Number(data.spd || 0);
  const sats = Number(data.sats || 0);

  elements.speedVal.textContent = spd.toFixed(1);
  elements.satsVal.textContent = String(sats);
  elements.latVal.textContent = `${lat.toFixed(6)}°`;
  elements.lngVal.textContent = `${lng.toFixed(6)}°`;
  elements.mapsLink.href = buildMapsUrl(lat, lng);

  const accuracy = sats >= 8 ? 'High' : sats >= 5 ? 'Med' : 'Low';
  const accuracyColor = sats >= 8 ? '#00c853' : sats >= 5 ? '#ffab00' : '#ff4444';
  elements.hdopVal.textContent = accuracy;
  elements.hdopVal.style.color = accuracyColor;

  state.lastReceivedAt = data.receivedAt || new Date().toISOString();
  updateMap(lat, lng);
  renderAge();
}

async function pollLatest() {
  try {
    const response = await fetch('/api/location');
    if (!response.ok) {
      throw new Error(`poll failed with status ${response.status}`);
    }

    const data = await response.json();
    updateUI(data);
    renderAge();
  } catch (error) {
    setStatus('offline', 'Server Offline');
    console.error('[POLL]', error);
  }
}

function startPollingFallback() {
  if (state.pollingTimer) {
    return;
  }

  state.connectionMode = nextTransportMode(false);
  pollLatest();
  state.pollingTimer = setInterval(pollLatest, POLLING_MS);
}

function stopPollingFallback() {
  if (!state.pollingTimer) {
    return;
  }

  clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

function connectStream() {
  try {
    const stream = new EventSource('/api/location/stream');
    state.stream = stream;
    state.connectionMode = nextTransportMode(true);

    stream.addEventListener('location', (event) => {
      try {
        const data = JSON.parse(event.data);
        updateUI(data);
      } catch (error) {
        console.error('[SSE] failed to parse payload', error);
      }
    });

    stream.addEventListener('error', () => {
      if (state.stream) {
        state.stream.close();
        state.stream = null;
      }
      startPollingFallback();
      setTimeout(connectStream, 8000);
    });

    stream.addEventListener('connected', () => {
      stopPollingFallback();
    });
  } catch (error) {
    console.error('[SSE] connection error', error);
    startPollingFallback();
  }
}

function toggleTrail() {
  state.trailOn = !state.trailOn;
  elements.trailBtn.textContent = state.trailOn ? 'Trail ON' : 'Trail OFF';
  elements.trailBtn.className = state.trailOn ? 'btn active' : 'btn';

  if (!state.trailOn) {
    state.trailHistory = [];
    polyline.setLatLngs([]);
  }
}

document.getElementById('trailBtn').addEventListener('click', toggleTrail);

connectStream();
pollLatest();
state.statusTicker = setInterval(renderAge, 1000);
