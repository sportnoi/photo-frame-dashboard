// Weather from Open-Meteo (no API key). Shaped like the dashboard's mock: hourly arrays indexed
// by hour of day, starting at local midnight today and running 48 hours.
const CACHE_MS = 15 * 60 * 1000;
let cache = { at: 0, data: null };

function cond(code, isDay) {
  if (code <= 1) return isDay ? 'sun' : 'moon';
  if (code === 2) return 'partly';
  if (code === 3 || code === 45 || code === 48) return 'cloud';
  return 'rain'; // drizzle, rain, snow, showers, thunder
}

export async function weather(cfg) {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const { lat, lon } = cfg.location;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&timezone=' + encodeURIComponent(cfg.timezone) + '&forecast_days=2' +
    '&hourly=temperature_2m,precipitation_probability,weather_code,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m';
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('open-meteo ' + r.status);
    const j = await r.json();
    const h = j.hourly;
    cache = {
      at: Date.now(),
      data: {
        hi: Math.round(j.daily.temperature_2m_max[0]),
        lo: Math.round(j.daily.temperature_2m_min[0]),
        feels: Math.round(j.current.apparent_temperature),
        humidity: Math.round(j.current.relative_humidity_2m),
        wind: Math.round(j.current.wind_speed_10m),
        t: h.temperature_2m.map(Math.round),
        c: h.weather_code.map((c, i) => cond(c, h.is_day[i])),
        p: h.precipitation_probability.map((p) => p || 0)
      }
    };
  } catch (e) {
    console.error('weather:', e.message);
  }
  return cache.data;
}
