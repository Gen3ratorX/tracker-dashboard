const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_STATE = {
  hasFix: false,
  lat: 0,
  lng: 0,
  spd: 0,
  sats: 0,
  deviceTime: null,
  receivedAt: null,
};

class LocationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.latest = { ...DEFAULT_STATE };
  }

  initSync() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length === 0) {
        return;
      }

      const parsed = JSON.parse(lines[lines.length - 1]);
      this.latest = { ...DEFAULT_STATE, ...parsed, hasFix: true };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }

      throw error;
    }
  }

  async append(location) {
    this.latest = { ...location, hasFix: true };
    await fsp.appendFile(this.filePath, `${JSON.stringify(this.latest)}\n`, 'utf8');
  }

  getLatest() {
    return { ...this.latest };
  }

  async getHistory(limit) {
    try {
      const content = await fsp.readFile(this.filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const slice = lines.slice(Math.max(lines.length - limit, 0));
      return slice.map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }
}

module.exports = {
  DEFAULT_STATE,
  LocationStore,
};
