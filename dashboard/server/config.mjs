// Family config: who's in the family, where we are, which calendars to show.
// Lives in $DATA_DIR/config.json so it can be edited on the Umbrel without rebuilding the image.
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const PHOTOS_DIR = path.resolve(process.env.PHOTOS_DIR || path.join(DATA_DIR, 'photos'));
export const PORT = +(process.env.PORT || 8790);

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULTS = {
  timezone: 'Pacific/Auckland',
  clock24: true,
  location: { name: 'Auckland', lat: -36.8485, lon: 174.7633 },
  people: [
    { id: 'parent1', name: 'Parent 1', color: '#2D5BFF' },
    { id: 'parent2', name: 'Parent 2', color: '#E4007C' },
    { id: 'kid1', name: 'Kid 1', color: '#00A36C' }
  ],
  // Read-only calendar feeds, e.g. Google Calendar "Secret address in iCal format".
  // { "name": "Work calendar", "url": "https://calendar.google.com/calendar/ical/.../basic.ics", "people": ["parent1"] }
  calendars: [],
  stores: [{ id: 'woolworths', name: 'Woolworths' }, { id: 'paknsave', name: "PAK'nSAVE" }]
};

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function inkFor(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111111' : '#FFFFFF';
}

export function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { fs.accessSync(DATA_DIR, fs.constants.W_OK); } catch { console.error('DATA_DIR ' + DATA_DIR + ' is not writable by uid ' + process.getuid?.()); process.exit(1); }
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULTS, null, 2));
  const cfg = Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  cfg.people = cfg.people.map((p) => Object.assign({ home: true, status: '' }, p, {
    rgb: hexToRgb(p.color).join(' '),
    ink: p.ink || inkFor(p.color)
  }));
  return cfg;
}
