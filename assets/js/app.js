/**
 * Spurious-ish Correlations — Wikipedia Pageviews Edition
 * Fetches pageview counts for pairs of Wikipedia articles and renders:
 *  - A dual time-series line chart (monthly views)
 *  - A scatter plot with linear regression and Pearson r
 *
 * Data source:
 *   - Wikimedia REST API (Pageviews): https://wikimedia.org/api/rest_v1/#/Pageviews%20data
 */

(() =&gt; {
  const chartsRoot = document.getElementById('charts');
  const monthsSelect = document.getElementById('months');
  const granularitySelect = document.getElementById('granularity');
  const reloadBtn = document.getElementById('reload');

  // 20 "strange" pairs of topics
  const PAIRS = [
    ["Nicolas Cage", "Beekeeping"],
    ["Quantum entanglement", "Banana bread"],
    ["Cryptozoology", "Pineapple"],
    ["Pokémon", "Gasoline"],
    ["Corgi", "Blockchain"],
    ["Astrology", "Astronomy"],
    ["Loch Ness Monster", "Cat"],
    ["Unidentified flying object", "Sourdough"],
    ["Peanut butter", "Lightning"],
    ["Kombucha", "Crop circle"],
    ["Artificial intelligence", "Toilet paper"],
    ["Roller coaster", "Knitting"],
    ["Flat Earth", "Vaccination"],
    ["Trombone", "Supernova"],
    ["Guitar", "Volcano"],
    ["Llama", "Meme"],
    ["Minecraft", "Kale"],
    ["TikTok", "Chess"],
    ["Hamster", "Mars"],
    ["Zombie", "Quantum computing"]
  ];

  // Helpers
  const clamp = (n, min, max) =&gt; Math.max(min, Math.min(max, n));
  const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

  const monthLabel = (yyyymm) =&gt; `${yyyymm.slice(0,4)}-${yyyymm.slice(4,6)}`;

  function lastFullMonth() {
    const d = new Date();
    d.setDate(1); // go to the first of this month
    d.setHours(0,0,0,0);
    d.setMonth(d.getMonth() - 1); // previous month
    return d;
  }

  function yyyymmdd(date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}${m}${d}`;
  }

  function addMonths(date, delta) {
    const d = new Date(date.getTime());
    d.setMonth(d.getMonth() + delta);
    return d;
  }

  function getRangeMonths(backMonths, granularity) {
    // For daily we fetch backMonths*30-ish days; for monthly exactly backMonths months
    const end = lastFullMonth();
    let start;
    if (granularity === 'monthly') {
      start = addMonths(end, -backMonths + 1);
      start.setDate(1);
    } else {
      // daily: approximate by subtracting backMonths months and then going to 1st
      start = addMonths(end, -backMonths + 1);
    }
    // API requires day component; for monthly it expects YYYYMM01
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

  async function fetchPageviews(article, backMonths = 36, granularity = 'monthly') {
    // Build endpoint
    const project = 'en.wikipedia.org';
    const access = 'all-access';
    const agent = 'user';
    const range = getRangeMonths(backMonths, granularity);
    const encoded = encodeURIComponent(article);
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${project}/${access}/${agent}/${encoded}/${granularity}/${range.start}/${range.end}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${article}`);
    }
    const data = await res.json();
    const items = data.items || [];

    // Normalize to map keyed by yyyymm (for monthly) or yyyymmdd (for daily)
    const out = new Map();
    for (const it of items) {
      const ts = it.timestamp; // e.g., 2023010100
      const key = granularity === 'monthly' ? ts.slice(0,6) : ts.slice(0,8);
      out.set(key, it.views);
    }
    return out;
  }

  function intersectKeys(mapA, mapB) {
    const keys = [];
    for (const k of mapA.keys()) {
      if (mapB.has(k)) keys.push(k);
    }
    keys.sort(); // chronological
    return keys;
  }

  function zipAligned(mapA, mapB) {
    const keys = intersectKeys(mapA, mapB);
    const xs = [];
    const ys = [];
    for (const k of keys) {
      xs.push(mapA.get(k));
      ys.push(mapB.get(k));
    }
    return { keys, xs, ys };
  }

  function pearsonR(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n &lt; 3) return NaN;
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
    for (let i = 0; i &lt; n; i++) {
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
    for (let i = 0; i &lt; n; i++) {
      const x = xs[i], y = ys[i];
      sumX += x; sumY += y;
      sumXX += x * x; sumXY += x * y;
    }
    const denom = (n * sumXX - sumX * sumX);
    const m = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const b = n === 0 ? 0 : (sumY - m * sumX) / n;
    return { m, b };
  }

  function articleURL(title) {
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  }

  function colorFromIndex(i) {
    const palette = [
      '#6ac2ff', '#ff8aa8', '#ffd166', '#a0e7e5', '#bdb2ff',
      '#80ed99', '#f4978e', '#f2cc8f', '#9bf6ff', '#caffbf',
      '#ffadad', '#fdffb6', '#bde0fe', '#ffc6ff', '#a7c957'
    ];
    return palette[i % palette.length];
  }

  function createCard(a, b) {
    const card = document.createElement('article');
    card.className = 'card loading';

    const header = document.createElement('div');
    header.className = 'card-header';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.innerHTML = `<strong>${a}</strong> vs <strong>${b}</strong> <span class="badge">r = <span class="r">…</span></span>`;
    header.appendChild(title);

    const links = document.createElement('div');
    links.className = 'card-links';
    links.innerHTML = `
      <a href="${articleURL(a)}" target="_blank" rel="noopener">Source A: ${a}</a>
      <a href="${articleURL(b)}" target="_blank" rel="noopener">Source B: ${b}</a>
      <a href="https://wikimedia.org/api/rest_v1/#/Pageviews%20data" target="_blank" rel="noopener">API docs</a>
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
    footer.textContent = 'Left: monthly pageviews time series. Right: pageviews of A vs B with linear fit.';

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);

    chartsRoot.appendChild(card);

    return {
      card,
      titleR: title.querySelector('.r'),
      lineCanvas,
      scatterCanvas
    };
  }

  function makeLineChart(ctx, labels, seriesA, seriesB, labelA, labelB, colorA, colorB) {
    const dsCommon = {
      fill: false,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 2
    };
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
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#a4a9b6' }
          },
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#a4a9b6', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#e6e8ef' }
          },
          tooltip: {
            callbacks: {
              label: (ctx) =&gt; {
                const v = ctx.parsed.y;
                return `${ctx.dataset.label}: ${Intl.NumberFormat().format(v)} views`;
              }
            }
          }
        }
      }
    });
  }

  function makeScatterChart(ctx, xs, ys, labelA, labelB, colorA, colorB) {
    const points = xs.map((x, i) =&gt; ({ x, y: ys[i] }));
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
          {
            label: `${labelA} vs ${labelB}`,
            data: points,
            backgroundColor: colorA,
            borderColor: colorA
          },
          {
            label: 'Linear fit',
            type: 'line',
            data: linePoints,
            borderColor: colorB,
            backgroundColor: colorB,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: `${labelA} monthly views`, color: '#a4a9b6' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#a4a9b6' }
          },
          y: {
            title: { display: true, text: `${labelB} monthly views`, color: '#a4a9b6' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#a4a9b6' }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#e6e8ef' }
          },
          tooltip: {
            callbacks: {
              label: (ctx) =&gt; {
                const p = ctx.raw;
                if (p &amp;&amp; typeof p.x === 'number' &amp;&amp; typeof p.y === 'number') {
                  return `(${Intl.NumberFormat().format(p.x)}, ${Intl.NumberFormat().format(p.y)})`;
                }
                return ctx.formattedValue;
              }
            }
          }
        }
      }
    });
  }

  async function renderAll() {
    chartsRoot.innerHTML = '';
    const backMonths = clamp(parseInt(monthsSelect.value, 10) || 36, 6, 120);
    const granularity = granularitySelect.value === 'daily' ? 'daily' : 'monthly';

    for (let i = 0; i &lt; PAIRS.length; i++) {
      const [a, b] = PAIRS[i];
      const { card, titleR, lineCanvas, scatterCanvas } = createCard(a, b);
      const colorA = colorFromIndex(i * 2);
      const colorB = colorFromIndex(i * 2 + 1);

      try {
        const [mapA, mapB] = await Promise.all([
          fetchPageviews(a, backMonths, granularity),
          fetchPageviews(b, backMonths, granularity)
        ]);

        const { keys, xs, ys } = zipAligned(mapA, mapB);
        if (keys.length &lt; 3) {
          throw new Error('Insufficient overlapping data');
        }

        const labels = keys.map(k =&gt; granularity === 'monthly' ? monthLabel(k) : k);
        const r = pearsonR(xs, ys);
        titleR.textContent = isFinite(r) ? fmt.format(r) : 'n/a';

        makeLineChart(lineCanvas.getContext('2d'), labels, xs, ys, a, b, colorA, colorB);
        makeScatterChart(scatterCanvas.getContext('2d'), xs, ys, a, b, colorA, colorB);

        card.classList.remove('loading');
      } catch (err) {
        card.classList.remove('loading');
        card.classList.add('error');
        const msg = document.createElement('div');
        msg.style.padding = '12px 14px';
        msg.innerHTML = `Failed to load data for <strong>${a}</strong> vs <strong>${b}</strong> — ${err.message}`;
        card.appendChild(msg);
      }
    }
  }

  reloadBtn.addEventListener('click', () =&gt; {
    renderAll();
  });

  // Initial render
  renderAll();
})();