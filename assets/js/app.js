/**
 * Spurious-ish Correlations — Multi-source Edition
 * Renders 50+ playful correlations from a mix of public web APIs.
 * Providers include: Wikimedia Pageviews, Open‑Meteo, ExchangeRate.host,
 * CoinGecko, OpenAlex, USGS Earthquakes, disease.sh (COVID-19), World Bank.
 */

(() => {
  const chartsRoot = document.getElementById('charts');
  const monthsSelect = document.getElementById('months');
  const granularitySelect = document.getElementById('granularity');
  const reloadBtn = document.getElementById('reload');

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const fmt3 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
  const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  const monthLabel = (yyyymm) => `${yyyymm.slice(0,4)}-${yyyymm.slice(4,6)}`;
  const toMonthKey = (d) => `${d.getFullYear()}${`${d.getMonth()+1}`.padStart(2,'0')}`;
  const toISO = (d) => `${d.getFullYear()}-${`${d.getMonth()+1}`.padStart(2,'0')}-${`${d.getDate()}`.padStart(2,'0')}`;

  function lastFullMonth() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  function addMonths(date, delta) {
    const d = new Date(date.getTime());
    d.setMonth(d.getMonth() + delta);
    return d;
  }
  function rangeDates(backMonths) {
    const endMonth = lastFullMonth();
    const startMonth = addMonths(endMonth, -backMonths + 1);
    startMonth.setDate(1);
    const endDate = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);
    return { startDate: startMonth, endDate, endMonth };
  }
  function yyyymmdd(date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}${m}${d}`;
  }
  function getRangeMonths(backMonths, granularity) {
    const end = lastFullMonth();
    let start;
    if (granularity === 'monthly') {
      start = addMonths(end, -backMonths + 1);
      start.setDate(1);
    } else {
      start = addMonths(end, -backMonths + 1);
    }
    if (granularity === 'monthly') {
      start.setDate(1);
      end.setDate(1);
      return {
        start: `${start.getFullYear()}${`${start.getMonth()+1}`.padStart(2,'0')}01`,
        end: `${end.getFullYear()}${`${end.getMonth()+1}`.padStart(2,'0')}01`
      };
    }
    return { start: yyyymmdd(start), end: yyyymmdd(end) };
  }

  // Wikimedia Pageviews (existing)
  async function fetchPageviews(article, backMonths = 36, granularity = 'monthly') {
    const project = 'en.wikipedia.org';
    const access = 'all-access';
    const agent = 'user';
    const range = getRangeMonths(backMonths, granularity);
    const encoded = encodeURIComponent(article);
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${project}/${access}/${agent}/${encoded}/${granularity}/${range.start}/${range.end}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${article}`);
    const data = await res.json();
    const items = data.items || [];
    const out = new Map();
    for (const it of items) {
      const ts = it.timestamp;
      const key = granularity === 'monthly' ? ts.slice(0,6) : ts.slice(0,8);
      out.set(key, it.views);
    }
    return out;
  }

  // Aggregation helpers
  function aggregateMonthlyAvgFromDaily(dateStrs, values) {
    const sum = new Map();
    const count = new Map();
    for (let i = 0; i < dateStrs.length; i++) {
      const iso = dateStrs[i];
      const yyyymm = iso.replace(/-/g,'').slice(0,6);
      const v = values[i];
      if (v == null || Number.isNaN(v)) continue;
      sum.set(yyyymm, (sum.get(yyyymm) || 0) + v);
      count.set(yyyymm, (count.get(yyyymm) || 0) + 1);
    }
    const out = new Map();
    for (const [k, s] of sum.entries()) {
      out.set(k, s / (count.get(k) || 1));
    }
    return out;
  }
  function aggregateMonthlySumFromDaily(dateStrs, values) {
    const sum = new Map();
    for (let i = 0; i < dateStrs.length; i++) {
      const iso = dateStrs[i];
      const yyyymm = iso.replace(/-/g,'').slice(0,6);
      const v = values[i];
      if (v == null || Number.isNaN(v)) continue;
      sum.set(yyyymm, (sum.get(yyyymm) || 0) + v);
    }
    return sum;
  }

  // Providers
  const Providers = {
    wp: {
      supports: { daily: true, monthly: true },
      label: (spec) => spec.title,
      source: (spec) => `https://en.wikipedia.org/wiki/${encodeURIComponent(spec.title.replace(/ /g, '_'))}`,
      fetch: (spec, backMonths, granularity) => fetchPageviews(spec.title, backMonths, granularity)
    },
    open_meteo: {
      supports: { daily: true, monthly: true },
      label: (spec) => spec.label || `Open‑Meteo ${spec.variable} (${spec.lat.toFixed(2)}, ${spec.lon.toFixed(2)})`,
      source: () => 'https://open-meteo.com/en/docs',
      fetch: async (spec, backMonths, granularity) => {
        const { startDate, endDate } = rangeDates(backMonths);
        const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${spec.lat}&longitude=${spec.lon}&start_date=${toISO(startDate)}&end_date=${toISO(endDate)}&daily=${spec.variable}&timezone=UTC`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Open‑Meteo ${r.status}`);
        const j = await r.json();
        const times = (j.daily && j.daily.time) || [];
        const vals = (j.daily && j.daily[spec.variable]) || [];
        if (granularity === 'daily') {
          const out = new Map();
          for (let i = 0; i < times.length; i++) {
            const key = times[i].replace(/-/g,''); // yyyymmdd
            out.set(key, vals[i]);
          }
          return out;
        }
        return aggregateMonthlyAvgFromDaily(times, vals);
      }
    },
    exchangerate: {
      supports: { daily: true, monthly: true },
      label: (spec) => `${spec.base}→${spec.symbol} FX`,
      source: () => 'https://exchangerate.host/#/',
      fetch: async (spec, backMonths, granularity) => {
        const { startDate, endDate } = rangeDates(backMonths);
        const url = `https://api.exchangerate.host/timeseries?start_date=${toISO(startDate)}&end_date=${toISO(endDate)}&base=${encodeURIComponent(spec.base)}&symbols=${encodeURIComponent(spec.symbol)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`ExchangeRate.host ${r.status}`);
        const j = await r.json();
        const rates = j.rates || {};
        const dates = Object.keys(rates).sort();
        const vals = dates.map(d => rates[d]?.[spec.symbol]);
        if (granularity === 'daily') {
          const out = new Map();
          for (let i = 0; i < dates.length; i++) out.set(dates[i].replace(/-/g,''), vals[i]);
          return out;
        }
        return aggregateMonthlyAvgFromDaily(dates, vals);
      }
    },
    coingecko: {
      supports: { daily: true, monthly: true },
      label: (spec) => `${spec.coinName || spec.coinId} price (${spec.vsCurrency.toUpperCase()})`,
      source: (spec) => `https://www.coingecko.com/en/coins/${encodeURIComponent(spec.coinId)}`,
      fetch: async (spec, backMonths, granularity) => {
        const approxDays = Math.max(30, Math.min(3650, Math.ceil(backMonths * 31)));
        const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(spec.coinId)}/market_chart?vs_currency=${encodeURIComponent(spec.vsCurrency)}&days=${approxDays}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
        const j = await r.json();
        const arr = j.prices || [];
        const dates = arr.map(([ms]) => {
          const d = new Date(ms);
          return `${d.getFullYear()}-${`${d.getMonth()+1}`.padStart(2,'0')}-${`${d.getDate()}`.padStart(2,'0')}`;
        });
        const vals = arr.map(([,v]) => v);
        if (granularity === 'daily') {
          const out = new Map();
          for (let i = 0; i < dates.length; i++) out.set(dates[i].replace(/-/g,''), vals[i]);
          return out;
        }
        return aggregateMonthlyAvgFromDaily(dates, vals);
      }
    },
    openalex: {
      supports: { daily: false, monthly: true },
      label: (spec) => `Publications mentioning ${spec.query}`,
      source: (spec) => `https://api.openalex.org/works?search=${encodeURIComponent(spec.query)}`,
      fetch: async (spec, backMonths) => {
        const { startDate, endDate } = rangeDates(backMonths);
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(spec.query)}&group_by=publication_year&per_page=200&filter=from_publication_date:${toISO(addMonths(startDate, -24))},to_publication_date:${toISO(endDate)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`OpenAlex ${r.status}`);
        const j = await r.json();
        const groups = j.group_by || [];
        const out = new Map();
        for (const g of groups) {
          const y = String(g.key || g.id || g.year || '');
          if (!/^\d{4}$/.test(y)) continue;
          const k = `${y}01`;
          out.set(k, g.count || g.value || 0);
        }
        return out;
      }
    },
    disease_sh: {
      supports: { daily: true, monthly: true },
      label: (spec) => `COVID‑19 ${spec.field} (${spec.country})`,
      source: (spec) => `https://disease.sh/v3/covid-19/historical/${encodeURIComponent(spec.country)}?lastdays=all`,
      fetch: async (spec, backMonths, granularity) => {
        const approxDays = Math.max(30, Math.ceil(backMonths * 31));
        const url = `https://disease.sh/v3/covid-19/historical/${encodeURIComponent(spec.country)}?lastdays=${approxDays}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`disease.sh ${r.status}`);
        const j = await r.json();
        const tl = (j.timeline && j.timeline[spec.field]) || j[spec.field] || {};
        const datesMDY = Object.keys(tl).sort((a,b)=> new Date(a) - new Date(b));
        const isoDates = datesMDY.map(mdy => {
          const d = new Date(mdy);
          return `${d.getFullYear()}-${`${d.getMonth()+1}`.padStart(2,'0')}-${`${d.getDate()}`.padStart(2,'0')}`;
        });
        const cumVals = datesMDY.map(d => tl[d]);
        // Convert cumulative to daily deltas (non-negative)
        const daily = [];
        for (let i = 1; i < cumVals.length; i++) {
          const diff = (cumVals[i] ?? 0) - (cumVals[i-1] ?? 0);
          daily.push(diff < 0 ? 0 : diff);
        }
        const dailyDates = isoDates.slice(1);
        if (granularity === 'daily') {
          const out = new Map();
          for (let i = 0; i < dailyDates.length; i++) out.set(dailyDates[i].replace(/-/g,''), daily[i]);
          return out;
        }
        return aggregateMonthlySumFromDaily(dailyDates, daily);
      }
    },
    usgs_quakes: {
      supports: { daily: true, monthly: true },
      label: (spec) => `Earthquakes ≥${spec.minMagnitude}`,
      source: () => 'https://earthquake.usgs.gov/fdsnws/event/1/',
      fetch: async (spec, backMonths, granularity) => {
        const { startDate, endDate } = rangeDates(backMonths);
        const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${toISO(startDate)}&endtime=${toISO(endDate)}&minmagnitude=${encodeURIComponent(spec.minMagnitude)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`USGS ${r.status}`);
        const j = await r.json();
        const feats = j.features || [];
        const isoDates = feats.map(f => {
          const d = new Date(f.properties?.time || 0);
          return `${d.getFullYear()}-${`${d.getMonth()+1}`.padStart(2,'0')}-${`${d.getDate()}`.padStart(2,'0')}`;
        });
        if (granularity === 'daily') {
          const out = new Map();
          for (const iso of isoDates) {
            const k = iso.replace(/-/g,'');
            out.set(k, (out.get(k) || 0) + 1);
          }
          return out;
        }
        return aggregateMonthlySumFromDaily(isoDates, isoDates.map(() => 1));
      }
    },
    worldbank: {
      supports: { daily: false, monthly: true },
      label: (spec) => spec.label || `World Bank ${spec.indicator} (${spec.country})`,
      source: (spec) => `https://data.worldbank.org/indicator/${encodeURIComponent(spec.indicator)}?locations=${encodeURIComponent(spec.country)}`,
      fetch: async (spec) => {
        const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(spec.country)}/indicator/${encodeURIComponent(spec.indicator)}?format=json&per_page=2000`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`World Bank ${r.status}`);
        const j = await r.json();
        const arr = (j[1] || []).filter(row => row.value != null && /^\d{4}$/.test(row.date));
        const out = new Map();
        for (const row of arr) {
          const k = `${row.date}01`;
          out.set(k, row.value);
        }
        return out;
      }
    }
  };

  function providerSupportsDaily(spec) {
    const p = Providers[spec.provider];
    return !!(p && p.supports.daily);
  }
  function specLabel(spec) {
    const p = Providers[spec.provider];
    return p ? p.label(spec) : 'Unknown';
    }
  function specSource(spec) {
    const p = Providers[spec.provider];
    return p ? p.source(spec) : '#';
  }
  async function fetchSeries(spec, backMonths, granularity) {
    const p = Providers[spec.provider];
    if (!p) throw new Error(`Unknown provider: ${spec.provider}`);
    const g = granularity || 'monthly';
    return await p.fetch(spec, backMonths, g);
  }
  function intersectKeys(mapA, mapB) {
    const keys = [];
    for (const k of mapA.keys()) if (mapB.has(k)) keys.push(k);
    keys.sort();
    return keys;
  }
  function zipAligned(mapA, mapB) {
    const keys = intersectKeys(mapA, mapB);
    const xs = [];
    const ys = [];
    for (const k of keys) { xs.push(mapA.get(k)); ys.push(mapB.get(k)); }
    return { keys, xs, ys };
  }
  function pearsonR(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return NaN;
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i];
      sumX += x; sumY += y;
      sumXX += x * x; sumYY += y * y;
      sumXY += x * y;
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    if (den === 0) return NaN;
    return num / den;
  }
  function linearRegression(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i];
      sumX += x; sumY += y;
      sumXX += x * x; sumXY += x * y;
    }
    const denom = (n * sumXX - sumX * sumX);
    const m = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const b = n === 0 ? 0 : (sumY - m * sumX) / n;
    return { m, b };
  }

  function colorFromIndex(i) {
    const palette = [
      '#6ac2ff', '#ff8aa8', '#ffd166', '#a0e7e5', '#bdb2ff',
      '#80ed99', '#f4978e', '#f2cc8f', '#9bf6ff', '#caffbf',
      '#ffadad', '#fdffb6', '#bde0fe', '#ffc6ff', '#a7c957'
    ];
    return palette[i % palette.length];
  }

  function createCard(specA, specB, granularity) {
    const labelA = specLabel(specA);
    const labelB = specLabel(specB);
    const linkA = specSource(specA);
    const linkB = specSource(specB);
    const gBadge = granularity === 'daily' ? 'daily' : 'monthly';

    const card = document.createElement('article');
    card.className = 'card loading';

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.innerHTML = `<strong>${labelA}</strong> vs <strong>${labelB}</strong> <span class="badge">r = <span class="r">…</span> • ${gBadge}</span>`;
    header.appendChild(title);

    const links = document.createElement('div');
    links.className = 'card-links';
    links.innerHTML = `
      <a href="${linkA}" target="_blank" rel="noopener">Source A</a>
      <a href="${linkB}" target="_blank" rel="noopener">Source B</a>
      <a href="https://wikimedia.org/api/rest_v1/#/Pageviews%20data" target="_blank" rel="noopener">Docs</a>
    `;
    header.appendChild(links);

    const body = document.createElement('div');
    body.className = 'card-body';

    const lineWrap = document.createElement('div');
    lineWrap.className = 'canvas-wrap';
    const lineCanvas = document.createElement('canvas');
    lineWrap.appendChild(lineCanvas);

    const scatterWrap = document.createElement('div');
    scatterWrap.className = 'canvas-wrap';
    const scatterCanvas = document.createElement('canvas');
    scatterWrap.appendChild(scatterCanvas);

    body.appendChild(lineWrap);
    body.appendChild(scatterWrap);

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.textContent = 'Left: time series. Right: A vs B with linear fit.';

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);

    chartsRoot.appendChild(card);

    return {
      card,
      titleR: title.querySelector('.r'),
      lineCanvas,
      scatterCanvas,
      labelA,
      labelB
    };
  }

  function makeLineChart(ctx, labels, seriesA, seriesB, labelA, labelB, colorA, colorB) {
    const dsCommon = { fill: false, tension: 0.25, pointRadius: 0, pointHoverRadius: 2 };
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: labelA, data: seriesA, borderColor: colorA, backgroundColor: colorA + '66', ...dsCommon },
          { label: labelB, data: seriesB, borderColor: colorB, backgroundColor: colorB + '66', ...dsCommon }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a4a9b6' } },
          x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a4a9b6', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }
        },
        plugins: {
          legend: { labels: { color: '#e6e8ef' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                return `${ctx.dataset.label}: ${nf0.format(v)}`;
              }
            }
          }
        }
      }
    });
  }

  function makeScatterChart(ctx, xs, ys, labelA, labelB, colorA, colorB) {
    const points = xs.map((x, i) => ({ x, y: ys[i] }));
    const { m, b } = linearRegression(xs, ys);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const linePoints = [
      { x: minX, y: m * minX + b },
      { x: maxX, y: m * maxX + b }
    ];

    return new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: `${labelA} vs ${labelB}`, data: points, backgroundColor: colorA, borderColor: colorA },
          { label: 'Linear fit', type: 'line', data: linePoints, borderColor: colorB, backgroundColor: colorB, borderWidth: 2, pointRadius: 0, tension: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: labelA, color: '#a4a9b6' }, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a4a9b6' } },
          y: { title: { display: true, text: labelB, color: '#a4a9b6' }, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#a4a9b6' } }
        },
        plugins: {
          legend: { labels: { color: '#e6e8ef' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = ctx.raw;
                if (p && typeof p.x === 'number' && typeof p.y === 'number') return `(${nf0.format(p.x)}, ${nf0.format(p.y)})`;
                return ctx.formattedValue;
              }
            }
          }
        }
      }
    });
  }

  // Build a large pool of series from diverse providers
  const s = {
    wp: (title) => ({ provider: 'wp', title }),
    om: (label, lat, lon, variable) => ({ provider: 'open_meteo', label, lat, lon, variable }),
    fx: (base, symbol) => ({ provider: 'exchangerate', base, symbol }),
    cg: (coinId, vsCurrency, coinName) => ({ provider: 'coingecko', coinId, vsCurrency, coinName }),
    oa: (query) => ({ provider: 'openalex', query }),
    cv: (country, field='cases') => ({ provider: 'disease_sh', country, field }),
    eq: (minMagnitude) => ({ provider: 'usgs_quakes', minMagnitude }),
    wb: (country, indicator, label) => ({ provider: 'worldbank', country, indicator, label })
  };

  const SERIES_POOL = [
    // Wikipedia
    s.wp('Nicolas Cage'), s.wp('Beekeeping'), s.wp('Quantum entanglement'), s.wp('Banana bread'),
    s.wp('Cryptozoology'), s.wp('Pineapple'), s.wp('Pokémon'), s.wp('Gasoline'),
    s.wp('Corgi'), s.wp('Blockchain'), s.wp('Astrology'), s.wp('Astronomy'),
    s.wp('Loch Ness Monster'), s.wp('Cat'), s.wp('Unidentified flying object'), s.wp('Sourdough'),
    s.wp('Peanut butter'), s.wp('Lightning'), s.wp('Kombucha'), s.wp('Crop circle'),
    s.wp('Artificial intelligence'), s.wp('Toilet paper'), s.wp('Roller coaster'), s.wp('Knitting'),
    s.wp('Flat Earth'), s.wp('Vaccination'), s.wp('Trombone'), s.wp('Supernova'),
    s.wp('Guitar'), s.wp('Volcano'), s.wp('Llama'), s.wp('Meme'),
    s.wp('Minecraft'), s.wp('Kale'), s.wp('TikTok'), s.wp('Chess'),
    s.wp('Hamster'), s.wp('Mars'), s.wp('Zombie'), s.wp('Quantum computing'),
    // Open‑Meteo (various cities/metrics)
    s.om('London precipitation', 51.5074, -0.1278, 'precipitation_sum'),
    s.om('Seattle precipitation', 47.6062, -122.3321, 'precipitation_sum'),
    s.om('Phoenix max temp', 33.4484, -112.0740, 'temperature_2m_max'),
    s.om('Reykjavik max wind', 64.1466, -21.9426, 'windspeed_10m_max'),
    s.om('Singapore precipitation', 1.3521, 103.8198, 'precipitation_sum'),
    s.om('Cairo max temp', 30.0444, 31.2357, 'temperature_2m_max'),
    s.om('Tokyo precipitation', 35.6762, 139.6503, 'precipitation_sum'),
    s.om('Sydney max wind', -33.8688, 151.2093, 'windspeed_10m_max'),
    s.om('Mumbai precipitation', 19.0760, 72.8777, 'precipitation_sum'),
    s.om('São Paulo precipitation', -23.5505, -46.6333, 'precipitation_sum'),
    // Exchange rates
    s.fx('USD','EUR'), s.fx('USD','JPY'), s.fx('GBP','USD'), s.fx('EUR','CHF'), s.fx('AUD','USD'),
    // Crypto (CoinGecko)
    s.cg('bitcoin','usd','Bitcoin'), s.cg('ethereum','usd','Ethereum'),
    s.cg('dogecoin','usd','Dogecoin'), s.cg('shiba-inu','usd','Shiba Inu'),
    s.cg('litecoin','usd','Litecoin'),
    // OpenAlex topics
    s.oa('zombie'), s.oa('kombucha'), s.oa('banana bread'), s.oa('ufology'),
    s.oa('corgi'), s.oa('sourdough'), s.oa('volcano'), s.oa('astrology'),
    s.oa('meme'), s.oa('quantum entanglement'),
    // COVID-19 (disease.sh)
    s.cv('USA','cases'), s.cv('United Kingdom','cases'), s.cv('India','cases'), s.cv('Japan','cases'), s.cv('Brazil','cases'),
    s.cv('USA','deaths'), s.cv('United Kingdom','deaths'), s.cv('India','deaths'),
    // USGS earthquakes
    s.eq(5.0), s.eq(6.0), s.eq(4.5),
    // World Bank annual indicators
    s.wb('USA','SP.POP.TOTL','USA population'), s.wb('JPN','SP.POP.TOTL','Japan population'),
    s.wb('IND','SP.POP.TOTL','India population'), s.wb('BRA','SP.POP.TOTL','Brazil population'),
    s.wb('USA','NY.GDP.PCAP.CD','USA GDP per capita (current US$)'),
    s.wb('USA','EN.ATM.CO2E.PC','USA CO₂ emissions (t per capita)'),
    s.wb('USA','IT.NET.USER.ZS','USA Internet users (%)'),
    s.wb('ZAF','SP.POP.TOTL','South Africa population'),
    s.wb('AUS','SP.POP.TOTL','Australia population')
  ];

  function randomInt(n) { return Math.floor(Math.random() * n); }
  function pairGranularity(specA, specB, requested) {
    if (requested === 'daily' && providerSupportsDaily(specA) && providerSupportsDaily(specB)) return 'daily';
    return 'monthly';
  }
  function generatePairs(pool, count) {
    const out = [];
    const used = new Set();
    while (out.length < count) {
      const a = pool[randomInt(pool.length)];
      const b = pool[randomInt(pool.length)];
      if (a === b) continue;
      const key = `${specLabel(a)}|${specLabel(b)}`;
      if (used.has(key)) continue;
      used.add(key);
      out.push([a, b]);
    }
    return out;
  }

  async function renderAll() {
    chartsRoot.innerHTML = '';
    const backMonths = clamp(parseInt(monthsSelect.value, 10) || 36, 6, 120);
    const requestedGranularity = granularitySelect.value === 'daily' ? 'daily' : 'monthly';

    const PAIRS = generatePairs(SERIES_POOL, 50);

    for (let i = 0; i < PAIRS.length; i++) {
      const [specA, specB] = PAIRS[i];
      const g = pairGranularity(specA, specB, requestedGranularity);
      const { card, titleR, lineCanvas, scatterCanvas, labelA, labelB } = createCard(specA, specB, g);
      const colorA = colorFromIndex(i * 2);
      const colorB = colorFromIndex(i * 2 + 1);

      try {
        const [mapA, mapB] = await Promise.all([
          fetchSeries(specA, backMonths, g),
          fetchSeries(specB, backMonths, g)
        ]);

        const { keys, xs, ys } = zipAligned(mapA, mapB);
        if (keys.length < 3) throw new Error('Insufficient overlapping data');

        const labels = keys.map(k => g === 'monthly' ? monthLabel(k) : k);
        const r = pearsonR(xs, ys);
        titleR.textContent = isFinite(r) ? fmt3.format(r) : 'n/a';

        makeLineChart(lineCanvas.getContext('2d'), labels, xs, ys, labelA, labelB, colorA, colorB);
        makeScatterChart(scatterCanvas.getContext('2d'), xs, ys, labelA, labelB, colorA, colorB);

        card.classList.remove('loading');
      } catch (err) {
        card.classList.remove('loading');
        card.classList.add('error');
        const msg = document.createElement('div');
        msg.style.padding = '12px 14px';
        msg.innerHTML = `Failed to load data for <strong>${specLabel(specA)}</strong> vs <strong>${specLabel(specB)}</strong> — ${err.message}`;
        card.appendChild(msg);
      }
    }
  }

  reloadBtn.addEventListener('click', () => {
    renderAll();
  });

  renderAll();
})();