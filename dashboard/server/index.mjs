// Family dashboard server: serves the built dashboard (dist/) and a small JSON API.
//   GET  /api/state         everything the dashboard needs (people, events, weather, lists, photos)
//   PUT  /api/lists         save groceries / chores / stars / week
//   PUT  /api/events/local  save the events added on the frame
//   GET  /api/photo/:id     a resized photo (?w=&h=)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, PORT, PHOTOS_DIR } from './config.mjs';
import * as store from './store.mjs';
import { weather } from './weather.mjs';
import { events } from './calendar.mjs';
import { photos, photoFile } from './photos.mjs';

const cfg = loadConfig();
process.env.TZ = cfg.timezone; // all-day iCal dates and chore resets use the family's timezone
const state = store.load(cfg);
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

function send(res, code, body, type) {
  res.writeHead(code, { 'content-type': type || 'application/json', 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Placeholder photos until real ones are dropped into the photos folder.
const SAMPLE_PHOTOS = ['auckland-harbour', 'piha-beach', 'waiheke-vines', 'rangitoto', 'kauri-forest', 'coromandel', 'tongariro', 'queenstown']
  .map((s, i) => ({ seed: s, o: i % 3 === 2 ? 'p' : 'l', date: '2025-0' + (i + 1) + '-1' + i, place: 'Sample photo', from: 'family', tag: 'sample' + (i % 4) }));

async function getState() {
  store.rollChores(cfg.timezone);
  const [ev, wx, ph] = await Promise.all([events(cfg, state), weather(cfg), photos()]);
  return {
    clock24: cfg.clock24,
    people: cfg.people,
    family: { id: 'family', name: 'Family', color: '#111111', rgb: '17 17 17', ink: '#FFFFFF' },
    stores: cfg.stores,
    events: ev,
    weather: wx,
    photos: ph.length ? ph : SAMPLE_PHOTOS,
    groceries: state.groceries,
    chores: state.chores,
    stars: state.stars,
    week: state.week
  };
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, await getState());
  if (req.method === 'PUT' && url.pathname === '/api/lists') {
    const b = await readBody(req);
    ['groceries', 'chores', 'stars', 'week'].forEach((k) => { if (b[k] !== undefined) state[k] = b[k]; });
    store.save();
    return send(res, 200, { ok: true });
  }
  if (req.method === 'PUT' && url.pathname === '/api/events/local') {
    const b = await readBody(req);
    if (!Array.isArray(b.events)) return send(res, 400, { error: 'events[] required' });
    state.localEvents = b.events.map((e) => ({
      id: String(e.id), title: String(e.title || 'New event'), start: e.start, end: e.end,
      allDay: !!e.allDay, people: e.people || [], loc: e.loc, notes: e.notes
    }));
    store.save();
    return send(res, 200, { ok: true });
  }
  const m = url.pathname.match(/^\/api\/photo\/([0-9a-f]{16})$/);
  if (req.method === 'GET' && m) {
    const file = await photoFile(m[1], url.searchParams.get('w'), url.searchParams.get('h'));
    if (!file) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=604800' });
    return fs.createReadStream(file).pipe(res);
  }
  send(res, 404, { error: 'not found' });
}

function staticFile(req, res, url) {
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) return send(res, 503, 'Dashboard not built yet: run "npm run build" in dashboard/', 'text/plain');
  const hashed = /[/\\]assets[/\\]/.test(file);
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else staticFile(req, res, url);
  } catch (e) {
    console.error(req.method, url.pathname, e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});
server.listen(PORT, () => {
  console.log('family dashboard on http://0.0.0.0:' + PORT + '  (photos: ' + PHOTOS_DIR + ', tz: ' + cfg.timezone + ')');
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(() => process.exit(0)); server.closeAllConnections(); });
