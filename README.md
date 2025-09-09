Core‑Relation‑ship Status: It’s Complicated

A playful exploration of spurious correlations using live data from multiple public web APIs. The app renders dozens of random pairings, plots each series over time, and shows a scatter plot with a simple linear fit and Pearson correlation coefficient r.

Important: This is built for fun and exploration. Correlation does not imply causation.

Quick start

- Option A: Open index.html directly in your browser
  - Works in most modern browsers since all code runs client‑side and APIs support CORS.
- Option B: Serve the folder with any static file server (recommended)
  - Python: python3 -m http.server 8000
  - Node: npx serve -l 8000
  - Then visit http://localhost:8000

Usage

- Months of data: Choose how far back to fetch (36–60 months by default)
- Granularity: Monthly or Daily
  - Daily is used only when both paired data sources support it
- Reload charts: Regenerates a new set of random pairings using the current controls

Each card contains:
- A time‑series line chart for both series (left)
- A scatter plot of A vs B with a best‑fit line (right)
- Pearson correlation coefficient r in the header

Data sources

The app fetches data live from these public APIs:

- Wikimedia Pageviews
  - Per‑article traffic for en.wikipedia.org
  - Supports daily and monthly series
- Open‑Meteo ERA5
  - Weather variables (e.g., precipitation_sum, temperature_2m_max, windspeed_10m_max)
  - Daily series aggregated to monthly averages when “Monthly” is selected
- Frankfurter (ECB FX)
  - Historical foreign exchange rates
  - Daily series aggregated to monthly averages when “Monthly” is selected
- OpenAlex
  - Publications mentioning a query term, grouped by year
  - Treated as an annual series and mapped to the first month of each year
- USGS Earthquakes
  - Event counts filtered by minimum magnitude
  - Daily counts aggregated to monthly sums for “Monthly”
- disease.sh (COVID‑19)
  - Country‑level cases or deaths; cumulative series are converted to daily deltas, then aggregated
- World Bank
  - Annual indicators (e.g., population, CO₂, Internet users, GDP per capita)
  - Treated as an annual series and mapped to the first month of each year

How it works

- Series pool
  - assets/js/app.js defines SERIES_POOL, a diverse list of candidate series from the providers above.
- Random pairing
  - The app randomly picks unique pairs from the pool and renders ~50 cards at a time.
- Fetch and alignment
  - Each provider returns a Map keyed by yyyymm or yyyymmdd.
  - The two series are intersected on common keys and aligned.
- Aggregation helpers
  - Daily→Monthly (average) for metrics like temperatures and FX rates
  - Daily→Monthly (sum) for event counts such as COVID‑19 deltas and earthquakes
  - Annual series are mapped to YYYY01 for compatibility with monthly charts.
- Metrics and charts
  - Pearson’s r is computed over the aligned numeric arrays.
  - Charts are rendered with Chart.js (loaded from a CDN in index.html).

Project structure

- index.html — Shell page, loads Chart.js and app.js
- assets/css/styles.css — UI theme and layout
- assets/js/app.js — Data fetching, pairing logic, correlation, and chart rendering

Extending and customization

- Add or remove series
  - Edit SERIES_POOL in assets/js/app.js
  - Convenience helpers exist: s.wp(title), s.om(label, lat, lon, variable), s.fx(base, symbol), s.oa(query), s.cv(country, field), s.eq(minMagnitude), s.wb(country, indicator, label)
- Add a new provider
  - Extend the Providers registry in assets/js/app.js with:
    - supports: { daily: boolean, monthly: boolean }
    - label(spec): string
    - source(spec): URL string
    - fetch(spec, backMonths, granularity): Promise&lt;Map&gt; keyed by yyyymm or yyyymmdd
- Change the look and feel
  - Tweak CSS variables and styles in assets/css/styles.css
  - Adjust color palette in colorFromIndex within assets/js/app.js

Notes and limitations

- Some pairings won’t have sufficient overlapping data; those cards are hidden.
- API availability, rate limits, or CORS policies may cause occasional errors. Reload to try different pairs.
- Daily granularity is only used when both sources support daily data.
- Annual series are visualized as stepped values across months.

Attribution

See links in the site footer and the “Data sources” section above for each provider’s documentation. Respect provider terms, usage limits, and attribution requirements.

Contributing

Issues and pull requests are welcome. If you add a new provider or series, please include a brief comment and a link to the source docs.

License

No license has been declared for this repository. If you plan to use or distribute this code, add a LICENSE file (e.g., MIT, Apache‑2.0) and update this section.