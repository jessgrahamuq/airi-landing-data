/**
 * AIRI Incidents stacked area chart
 *
 * Mounts into an element with id="airi-chart-incidents".
 * Fetches data from /data/incidents.json in the same repo.
 *
 * Hosted at:
 *   https://jessgrahamuq.github.io/airi-landing-data/widgets/incidents-chart.js
 */
(function () {
  var DATA_URL = 'https://jessgrahamuq.github.io/airi-landing-data/data/incidents.json';

  var COLORS = {
    'Discrimination & Toxicity': '#A32035',
    'Privacy & Security': '#66C2A5',
    'Misinformation': '#E78AC3',
    'Malicious Actors': '#FC8D62',
    'Human-Computer Interaction': '#8DA0CB',
    'Socioeconomic & Environmental': '#A6D854',
    'AI System Safety, Failures & Limitations': '#E5C494',
    'Other': '#ccc'
  };

  var MIN_YEAR = 2018;

  function run() {
    var mount = document.getElementById('airi-chart-incidents');
    if (!mount) return;
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { render(mount, data); })
      .catch(function (err) {
        console.error('[airi-incidents-chart]', err);
        mount.innerHTML = '<div style="color:#888;font-size:0.9rem">Data temporarily unavailable.</div>';
      });
  }

  function render(mount, data) {
    var series = data.chart.series.filter(function (s) { return s.year >= MIN_YEAR; });
    var domains = data.chart.domains.filter(function (d) {
      return series.some(function (s) { return (s[d] || 0) > 0; });
    });

    var W = 700, H = 360, mL = 40, mR = 20, mT = 20, mB = 40;
    var iw = W - mL - mR, ih = H - mT - mB;

    var years = series.map(function (s) { return s.year; });
    var xMin = Math.min.apply(null, years);
    var xMax = Math.max.apply(null, years);

    var stacked = series.map(function (s) {
      var acc = 0, parts = [];
      domains.forEach(function (k) {
        var v = s[k] || 0;
        parts.push({ k: k, a: acc, b: acc + v });
        acc += v;
      });
      return { year: s.year, parts: parts, total: acc };
    });

    var yMax = Math.max.apply(null, stacked.map(function (s) { return s.total; }));

    function xScale(x) { return mL + ((x - xMin) / (xMax - xMin || 1)) * iw; }
    function yScale(y) { return mT + ih - (y / yMax) * ih; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI incidents per year, stacked by risk domain">';

    [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
      var v = Math.round(yMax * p);
      var y = yScale(v);
      svg += '<line x1="' + mL + '" y1="' + y + '" x2="' + (W - mR) + '" y2="' + y + '" stroke="#eee"/>';
      svg += '<text x="' + (mL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#888">' + v + '</text>';
    });

    domains.forEach(function (k) {
      var top = '', bot = '';
      stacked.forEach(function (s, i) {
        var p = s.parts.find(function (q) { return q.k === k; });
        var x = xScale(s.year);
        top += (i ? ' L' : 'M') + x + ',' + yScale(p.b);
        bot = ' L' + x + ',' + yScale(p.a) + bot;
      });
      svg += '<path d="' + top + bot + ' Z" fill="' + (COLORS[k] || '#ccc') + '" opacity="0.92"/>';
    });

    for (var y = xMin; y <= xMax; y++) {
      svg += '<text x="' + xScale(y) + '" y="' + (H - mB + 16) + '" text-anchor="middle" font-size="10" fill="#888">' + y + '</text>';
    }
    svg += '</svg>';

    var legend = '<div class="airi-chart-legend">';
    domains.forEach(function (k) {
      legend += '<span class="airi-chart-legend-item">' +
        '<span class="airi-chart-legend-swatch" style="background:' + (COLORS[k] || '#ccc') + '"></span>' +
        k + '</span>';
    });
    legend += '</div>';

    mount.innerHTML = svg + legend;
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
