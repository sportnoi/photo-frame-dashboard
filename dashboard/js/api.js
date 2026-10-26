// Loads the family's real data from the server into window.DATA (replacing the mock in data.js),
// saves edits back, and refreshes calendar/weather/photos every few minutes.
(function () {
  'use strict';
  var D = window.DATA;
  var REFRESH_MS = 3 * 60 * 1000;
  var applying = false;
  var pending = null, timer = null;

  // The mock's counters restart on every load, which would collide with saved items.
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  D._eid = function () { return uid('e'); };
  D._gid = function () { return uid('g'); };

  function revive(list) {
    return (list || []).map(function (e) {
      e.start = new Date(e.start);
      e.end = new Date(e.end);
      if (!e.people || !e.people.length) e.people = D.ALL.slice();
      return e;
    });
  }

  function apply(s, first) {
    applying = true;
    D.clock24 = !!s.clock24;
    D.people = s.people;
    D.family = s.family;
    D.ALL = s.people.map(function (p) { return p.id; });
    D.stores = s.stores;
    D.catOrder = { all: D.catOrder.all };
    s.stores.forEach(function (st) { D.catOrder[st.id] = D.catOrder.all; });
    D.events = revive(s.events);
    D.busyExtras = [];
    D.routines[1].name = 'Afternoon';
    if (s.weather) D.weather = s.weather;
    if (s.photos && s.photos.length) D.photos = s.photos;
    // Lists are owned by the frame; only take the server's copy on start or when nothing is pending.
    if (first || !pending) {
      D.groceries = s.groceries;
      D.chores = s.chores;
      D.stars = s.stars;
      D.week = s.week;
    }
    if (!first && window.App) App.emit('data');
    applying = false;
  }

  function get() {
    return fetch('/api/state', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('state ' + r.status);
      return r.json();
    });
  }

  // Start-up: wait for real data (retrying), so the dashboard never shows the demo family.
  window.DATA_READY = new Promise(function (resolve) {
    (function attempt() {
      get().then(function (s) { apply(s, true); resolve(); }).catch(function (e) {
        console.error('[api] load failed, retrying', e);
        setTimeout(attempt, 5000);
      });
    })();
  });

  // ------------------------------------------------------------ saving
  function put(path, body) {
    return fetch(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); });
  }
  function flush() {
    if (!pending) return;
    var job = pending; pending = null;
    var local = D.events.filter(function (e) { return !e.src || e.src === 'local'; });
    Promise.all([
      put('/api/lists', { groceries: D.groceries, chores: D.chores, stars: D.stars, week: D.week }),
      put('/api/events/local', { events: local })
    ]).catch(function (e) {
      console.error('[api] save failed, will retry', e);
      pending = pending || job;
      clearTimeout(timer); timer = setTimeout(flush, 10000);
    });
  }
  function schedule() {
    if (applying) return;
    pending = true;
    clearTimeout(timer); timer = setTimeout(flush, 800);
  }

  window.DATA_READY.then(function () {
    App.on('data', schedule);
    setInterval(function () {
      // Don't yank the page out from under someone mid-edit.
      if (document.querySelector('#sheetLayer.is-open')) return;
      get().then(function (s) { apply(s, false); }).catch(function (e) { console.error('[api] refresh failed', e); });
    }, REFRESH_MS);
  });
})();
