// Small JSON-file store for everything the family edits on the frame:
// shopping list, chores, stars, and events added on the frame ("local" calendar).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.mjs';

const FILE = path.join(DATA_DIR, 'state.json');

function seed(cfg) {
  const kids = cfg.people.filter((p) => p.age != null).map((p) => p.id);
  const stars = {}, week = {};
  kids.forEach((id) => { stars[id] = 0; week[id] = [null, null, null, null, null, null, null]; });
  let n = 0;
  const chore = (r, who, title, emoji, s) => ({ id: 'c' + (++n), r, who, title, emoji, stars: s, done: false });
  const chores = [];
  kids.forEach((k) => {
    chores.push(chore('morning', k, 'Brush teeth', '🪥', 1), chore('after', k, 'Tidy toys', '🧸', 1), chore('evening', k, 'Bath', '🛁', 1));
  });
  chores.push(
    chore('morning', 'any', 'Unload dishwasher', '🍽️', 0),
    chore('after', 'any', 'Water the plants', '🪴', 0),
    chore('evening', 'any', 'Run dishwasher', '🫧', 0),
    chore('evening', 'any', 'Take out rubbish', '🗑️', 0)
  );
  return { groceries: [], chores, stars, week, localEvents: [], choresDay: null };
}

let state = null;

export function load(cfg) {
  if (state) return state;
  state = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : seed(cfg);
  save();
  return state;
}

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  }, 200);
}

// Chores reset every morning. Before resetting, record whether each kid finished yesterday.
export function rollChores(tz) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  if (state.choresDay === today) return;
  if (state.choresDay) {
    const prev = new Date(state.choresDay + 'T12:00:00Z');
    const dow = (prev.getUTCDay() + 6) % 7; // Mon = 0
    Object.keys(state.week).forEach((kid) => {
      const mine = state.chores.filter((c) => c.who === kid);
      state.week[kid][dow] = mine.length && mine.every((c) => c.done) ? 1 : 0;
    });
    // New week starts on Monday: clear the dots.
    const todayDow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
    if (todayDow === 0) Object.keys(state.week).forEach((kid) => { state.week[kid] = [null, null, null, null, null, null, null]; });
  }
  state.chores.forEach((c) => { c.done = false; delete c.doneBy; });
  state.choresDay = today;
  save();
}
