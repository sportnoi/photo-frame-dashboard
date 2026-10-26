// Photos from a local folder (sub-folders become "albums"). Served resized so the frame's
// 1 GB of RAM never has to decode a 12-megapixel original.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { DATA_DIR, PHOTOS_DIR } from './config.mjs';

const CACHE_DIR = path.join(DATA_DIR, 'cache');
const EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
const RESCAN_MS = 10 * 60 * 1000;
let index = { at: 0, list: [], byId: new Map() };
let meta = {}; // file -> { mtime, o, date }
const META_FILE = path.join(DATA_DIR, 'photos-meta.json');
try { meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch (e) { /* first run */ }

function walk(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of entries) {
    if (d.name.startsWith('.')) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (EXT.test(d.name)) out.push(p);
  }
  return out;
}

async function describe(file) {
  const st = fs.statSync(file);
  const rel = path.relative(PHOTOS_DIR, file);
  const m = meta[rel];
  if (m && m.mtime === st.mtimeMs) return m;
  let o = 'l', date = new Date(st.mtimeMs);
  try {
    const md = await sharp(file).metadata();
    const rotated = md.orientation >= 5;
    const w = rotated ? md.height : md.width, h = rotated ? md.width : md.height;
    o = h > w ? 'p' : 'l';
    const ex = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null);
    if (ex && (ex.DateTimeOriginal || ex.CreateDate)) date = new Date(ex.DateTimeOriginal || ex.CreateDate);
  } catch (e) {
    console.error('photo', rel, e.message);
    return null;
  }
  meta[rel] = { mtime: st.mtimeMs, o, date: date.toISOString().slice(0, 10) };
  return meta[rel];
}

export async function photos() {
  if (Date.now() - index.at < RESCAN_MS) return index.list;
  const files = walk(PHOTOS_DIR, []);
  const list = [], byId = new Map();
  for (const file of files) {
    const m = await describe(file);
    if (!m) continue;
    const rel = path.relative(PHOTOS_DIR, file);
    const id = crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16);
    const album = path.dirname(rel) === '.' ? '' : path.dirname(rel).split(path.sep).join(' · ');
    byId.set(id, file);
    list.push({ seed: '/api/photo/' + id, o: m.o, date: m.date, place: album, from: 'family', tag: album || m.date.slice(0, 7) });
  }
  fs.writeFileSync(META_FILE, JSON.stringify(meta));
  index = { at: Date.now(), list, byId };
  return list;
}

export async function photoFile(id, w, h) {
  if (!index.byId.size) await photos();
  const file = index.byId.get(id);
  if (!file) return null;
  w = Math.min(Math.max(+w || 1280, 64), 1600);
  h = Math.min(Math.max(+h || 800, 64), 1600);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const out = path.join(CACHE_DIR, id + '-' + w + 'x' + h + '.jpg');
  if (!fs.existsSync(out)) {
    await sharp(file).rotate().resize(w, h, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  }
  return out;
}
