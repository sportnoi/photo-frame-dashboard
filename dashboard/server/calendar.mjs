// Calendar: read-only iCal feeds (e.g. Google "Secret address in iCal format") plus events
// added on the frame, which are stored locally.
import ical from 'node-ical';

const CACHE_MS = 5 * 60 * 1000;
const PAST_DAYS = 45, FUTURE_DAYS = 90;
const cache = new Map(); // url -> { at, events }

function windowRange() {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - PAST_DAYS);
  const to = new Date(from); to.setDate(to.getDate() + PAST_DAYS + FUTURE_DAYS);
  return { from, to };
}

function shape(ev, start, end, feed, idx, key) {
  const allDay = ev.datetype === 'date' || ev.start?.dateOnly === true;
  if (!end) end = new Date(+start + (allDay ? 864e5 : 36e5));
  return {
    id: 'ics' + idx + ':' + key,
    title: String(ev.summary || '(No title)'),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    people: feed.people && feed.people.length ? feed.people : null,
    loc: ev.location ? String(ev.location) : undefined,
    notes: ev.description ? String(ev.description).slice(0, 500) : undefined,
    src: 'ics'
  };
}

async function readFeed(feed, idx) {
  const hit = cache.get(feed.url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.events;
  const { from, to } = windowRange();
  const out = [];
  try {
    const data = await ical.async.fromURL(feed.url);
    for (const ev of Object.values(data)) {
      if (ev.type !== 'VEVENT' || !ev.start) continue;
      const dur = ev.end ? ev.end - ev.start : null;
      if (ev.rrule) {
        for (const occ of ev.rrule.between(from, to, true)) {
          const dayKey = occ.toISOString().slice(0, 10);
          if (ev.exdate && Object.keys(ev.exdate).some((k) => k.slice(0, 10) === dayKey)) continue;
          const over = ev.recurrences && Object.entries(ev.recurrences).find(([k]) => k.slice(0, 10) === dayKey);
          if (over) { const o = over[1]; out.push(shape(o, o.start, o.end, feed, idx, ev.uid + '@' + dayKey)); continue; }
          // Keep the original wall-clock time across DST changes.
          const start = new Date(occ);
          if (ev.datetype !== 'date') start.setHours(ev.start.getHours(), ev.start.getMinutes(), 0, 0);
          out.push(shape(ev, start, dur != null ? new Date(+start + dur) : null, feed, idx, ev.uid + '@' + dayKey));
        }
      } else if (ev.start < to && (ev.end || ev.start) >= from) {
        out.push(shape(ev, ev.start, ev.end, feed, idx, ev.uid));
      }
    }
    cache.set(feed.url, { at: Date.now(), events: out });
    return out;
  } catch (e) {
    console.error('calendar feed', feed.name || idx, e.message);
    return hit ? hit.events : [];
  }
}

// "@diana" or "@santi @vicky" in an event's title or description assigns it to those people
// (matched on person id or first name, case-insensitive). Tags are stripped from the title.
function tagPeople(e, people, all) {
  const byKey = new Map();
  for (const p of people) { byKey.set(p.id.toLowerCase(), p.id); byKey.set(String(p.name).toLowerCase(), p.id); }
  const tagged = new Set();
  const scan = (text) => String(text || '').replace(/(^|\s)@([\p{L}\p{N}_-]+)/gu, (m, sp, k) => {
    const id = byKey.get(k.toLowerCase());
    if (id) { tagged.add(id); return sp; }
    return m;
  });
  const title = scan(e.title).replace(/\s{2,}/g, ' ').trim() || e.title;
  scan(e.notes);
  return Object.assign({}, e, { title, people: tagged.size ? [...tagged] : (e.people || all) });
}

export async function events(cfg, state) {
  const all = cfg.people.map((p) => p.id);
  const feeds = await Promise.all((cfg.calendars || []).filter((f) => f.url).map(readFeed));
  const remote = feeds.flat().map((e) => tagPeople(e, cfg.people, all));
  const local = state.localEvents.map((e) => Object.assign({}, e, { src: 'local' }));
  return remote.concat(local);
}
