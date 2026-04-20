/**
 * AIRI Governance stacked bar chart (v1.0.2)
 *
 * Mounts into an element with id="airi-chart-governance".
 * Fetches from /data/governance.json in the same repo.
 *
 * Hosted at:
 *   https://jessgrahamuq.github.io/airi-landing-data/widgets/governance-chart.js
 *
 * Visual: 24 subdomains across x-axis (1.1 through 7.6), each a stacked bar
 * with Good / Minimal / No-Coverage segments. Bar color = parent risk domain.
 * Hover a bar: tooltip with counts. Click: modal listing top documents
 * covering that subdomain with links to source.
 *
 * v1.0.2 — wider viewBox (1000 × 480) so the chart fills panel width.
 * v1.0.1 — taller chart, smaller muted legend beneath.
 */
(function () {
  var DATA_URL = 'https://jessgrahamuq.github.io/airi-landing-data/data/governance.json';

  var COLORS = {
    'Discrimination & Toxicity': '#A32035',
    'Privacy & Security': '#66C2A5',
    'Misinformation': '#E78AC3',
    'Malicious Actors': '#FC8D62',
    'Human-Computer Interaction': '#8DA0CB',
    'Socioeconomic & Environmental': '#A6D854',
    'AI System Safety, Failures & Limitations': '#E5C494'
  };
  var COVERAGE_STYLE = {
    'Good':    { opacity: 1.00, label: 'Good coverage' },
    'Minimal': { opacity: 0.55, label: 'Minimal coverage' },
    'None':    { opacity: 0.18, label: 'No coverage' }
  };

  var TEXT_PRIMARY = '#1A1A1A';
  var TEXT_MUTED = '#898A8D';
  var GRID_COLOR = 'rgba(26,26,26,0.18)';

  function run() {
    var mount = document.getElementById('airi-chart-governance');
    if (!mount) return;
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { render(mount, data); })
      .catch(function (err) {
        console.error('[airi-governance-chart]', err);
        mount.innerHTML = '<div style="color:' + TEXT_MUTED + ';font-size:0.9rem">Data temporarily unavailable.</div>';
      });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch (e) { return ''; }
  }

  function render(mount, data) {
    var series = data.chart.series;
    var levels = data.chart.coverage_levels;
    var topDocs = data.top_documents_by_subdomain || {};

    // Wider viewBox so the chart fills panel width, with 480 height for taller bars
    var W = 1000, H = 480, mL = 48, mR = 20, mT = 16, mB = 72;
    var iw = W - mL - mR, ih = H - mT - mB;

    var yMax = Math.max.apply(null, series.map(function (r) { return r.total; })) || 1;
    var n = series.length;
    var bandWidth = iw / n;
    var barWidth = Math.max(4, bandWidth * 0.75);

    function xCenter(i) { return mL + bandWidth * (i + 0.5); }
    function yScale(v) { return mT + ih - (v / yMax) * ih; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"' +
      ' role="img" aria-label="Governance document coverage by risk subdomain"' +
      ' style="display:block;width:100%;height:auto;font-family:Figtree,sans-serif;">';

    var yTicks = 5;
    for (var t = 0; t <= yTicks; t++) {
      var v = Math.round((yMax * t) / yTicks);
      var y = yScale(v);
      svg += '<line x1="' + mL + '" y1="' + y + '" x2="' + (W - mR) + '" y2="' + y + '" stroke="' + GRID_COLOR + '"/>';
      svg += '<text x="' + (mL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="' + TEXT_PRIMARY + '">' + v + '</text>';
    }

    series.forEach(function (row, i) {
      var cx = xCenter(i);
      var x = cx - barWidth / 2;
      var domain = row.domain;
      var color = COLORS[domain] || '#ccc';
      var accum = 0;
      levels.forEach(function (lvl) {
        var c = row[lvl] || 0;
        if (c === 0) return;
        var y0 = yScale(accum);
        var y1 = yScale(accum + c);
        var h = Math.max(0, y0 - y1);
        svg += '<rect class="airi-gchart-seg" ' +
          'data-subdomain="' + esc(row.subdomain) + '" data-level="' + esc(lvl) + '" ' +
          'x="' + x.toFixed(2) + '" y="' + y1.toFixed(2) + '" ' +
          'width="' + barWidth.toFixed(2) + '" height="' + h.toFixed(2) + '" ' +
          'fill="' + color + '" opacity="' + COVERAGE_STYLE[lvl].opacity + '"/>';
        accum += c;
      });
    });

    series.forEach(function (row, i) {
      svg += '<text x="' + xCenter(i).toFixed(2) + '" y="' + (H - mB + 16) + '" ' +
        'text-anchor="middle" font-size="10" fill="' + TEXT_PRIMARY + '">' +
        esc(row.subdomain) + '</text>';
    });

    var groupLabelY = H - mB + 44;
    var i2 = 0;
    while (i2 < series.length) {
      var curDomain = series[i2].domain;
      var j = i2;
      while (j < series.length && series[j].domain === curDomain) j++;
      var x1 = xCenter(i2) - bandWidth * 0.38;
      var x2 = xCenter(j - 1) + bandWidth * 0.38;
      var xMid = (x1 + x2) / 2;
      var color2 = COLORS[curDomain] || '#ccc';
      svg += '<line x1="' + x1.toFixed(2) + '" y1="' + (groupLabelY - 10) + '" ' +
        'x2="' + x2.toFixed(2) + '" y2="' + (groupLabelY - 10) + '" ' +
        'stroke="' + color2 + '" stroke-width="2" opacity="0.8"/>';
      var short = shortDomain(curDomain);
      svg += '<text x="' + xMid.toFixed(2) + '" y="' + groupLabelY + '" ' +
        'text-anchor="middle" font-size="10" fill="' + TEXT_MUTED + '">' +
        esc(short) + '</text>';
      i2 = j;
    }

    series.forEach(function (row, i) {
      svg += '<rect class="airi-gchart-hit" data-subdomain="' + esc(row.subdomain) + '" ' +
        'x="' + (mL + bandWidth * i) + '" y="' + mT + '" ' +
        'width="' + bandWidth + '" height="' + ih + '" ' +
        'fill="transparent" style="cursor:pointer"/>';
    });

    svg += '</svg>';

    var legend = '<div class="airi-gchart-legend">';
    levels.forEach(function (lvl) {
      legend += '<span class="airi-gchart-legend-item">' +
        '<span class="airi-gchart-legend-swatch" style="background:' + TEXT_PRIMARY + ';opacity:' + COVERAGE_STYLE[lvl].opacity + '"></span>' +
        esc(COVERAGE_STYLE[lvl].label) + '</span>';
    });
    legend += '</div>';

    var lu = formatDate(data.meta && data.meta.last_updated);
    var footer = '<div class="airi-gchart-footer">' +
      (lu ? 'Last updated ' + esc(lu) : '') +
      (data.meta && data.meta.record_count
        ? ' \u00b7 ' + data.meta.record_count.toLocaleString() + ' governance documents'
        : '') +
      ' \u00b7 <span class="airi-gchart-hint">Click a bar to see documents</span>' +
      '</div>';

    var tooltip = '<div class="airi-gchart-tooltip" role="tooltip" aria-hidden="true"></div>';
    var modal = '<div class="airi-gchart-modal" role="dialog" aria-modal="true" aria-hidden="true"></div>';

    var style = '<style>' +
      '#airi-chart-governance { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; }' +
      '.airi-gchart-seg { transition: opacity 0.15s ease; }' +
      '.airi-gchart-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: center; margin-top: 6px; font-size: 10px; color: ' + TEXT_MUTED + '; }' +
      '.airi-gchart-legend-item { display: inline-flex; align-items: center; gap: 4px; }' +
