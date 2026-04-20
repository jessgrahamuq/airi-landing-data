/**
 * AIRI Incidents stacked area chart
 *
 * Mounts into an element with id="airi-chart-incidents".
 * Fetches data from /data/incidents.json in the same repo.
 *
 * Hosted at:
 *   https://jessgrahamuq.github.io/airi-landing-data/widgets/incidents-chart.js
 *
 * Features:
 *   - Stacked area by 7 MIT Risk Repo domains, 2018+
 *   - Hover a band: dim other bands, highlight that domain in the legend
 *   - Hover a year: tooltip showing per-domain breakdown for that year
 *   - Last-updated note below chart, pulled from meta.last_updated
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

  // Escape text for safe HTML insertion
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatLastUpdated(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch (e) {
      return '';
    }
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
        parts.push({ k: k, a: acc, b: acc + v, v: v });
        acc += v;
      });
      return { year: s.year, parts: parts, total: acc };
    });

    var yMax = Math.max.apply(null, stacked.map(function (s) { return s.total; }));

    function xScale(x) { return mL + ((x - xMin) / (xMax - xMin || 1)) * iw; }
    function yScale(y) { return mT + ih - (y / yMax) * ih; }

    // Slugify for data attributes
    function slug(k) {
      return k.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // -- Build SVG --------------------------------------------------------
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"' +
      ' role="img" aria-label="AI incidents per year, stacked by risk domain"' +
      ' style="display:block;width:100%;height:auto;">';

    // Y gridlines + labels
    [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
      var v = Math.round(yMax * p);
      var y = yScale(v);
      svg += '<line x1="' + mL + '" y1="' + y + '" x2="' + (W - mR) + '" y2="' + y + '" stroke="#eee"/>';
      svg += '<text x="' + (mL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#888">' + v + '</text>';
    });

    // Stacked area paths (one per domain). data-domain is used for hover targeting.
    domains.forEach(function (k) {
      var top = '', bot = '';
      stacked.forEach(function (s, i) {
        var p = s.parts.find(function (q) { return q.k === k; });
        var x = xScale(s.year);
        top += (i ? ' L' : 'M') + x + ',' + yScale(p.b);
        bot = ' L' + x + ',' + yScale(p.a) + bot;
      });
      svg += '<path class="airi-chart-band" data-domain="' + esc(slug(k)) + '" ' +
        'd="' + top + bot + ' Z" fill="' + (COLORS[k] || '#ccc') + '" opacity="0.92"/>';
    });

    // X axis year labels
    for (var y = xMin; y <= xMax; y++) {
      svg += '<text x="' + xScale(y) + '" y="' + (H - mB + 16) + '" text-anchor="middle" font-size="10" fill="#888">' + y + '</text>';
    }

    // Invisible per-year hover bands (wider clickable target for tooltips)
    var bandWidth = iw / Math.max(years.length - 1, 1);
    stacked.forEach(function (s) {
      var cx = xScale(s.year);
      svg += '<rect class="airi-chart-yearband" data-year="' + s.year + '" ' +
        'x="' + (cx - bandWidth / 2) + '" y="' + mT + '" ' +
        'width="' + bandWidth + '" height="' + ih + '" ' +
        'fill="transparent" style="cursor:crosshair"/>';
    });

    // Hover guide line (hidden until a year is hovered)
    svg += '<line class="airi-chart-guide" x1="0" y1="' + mT + '" x2="0" y2="' + (mT + ih) + '" ' +
      'stroke="#333" stroke-dasharray="3,3" opacity="0" pointer-events="none"/>';

    svg += '</svg>';

    // -- Build legend -----------------------------------------------------
    var legend = '<div class="airi-chart-legend">';
    domains.forEach(function (k) {
      legend += '<span class="airi-chart-legend-item" data-domain="' + esc(slug(k)) + '">' +
        '<span class="airi-chart-legend-swatch" style="background:' + (COLORS[k] || '#ccc') + '"></span>' +
        esc(k) + '</span>';
    });
    legend += '</div>';

    // -- Last updated note ------------------------------------------------
    var lastUpdatedStr = formatLastUpdated(data.meta && data.meta.last_updated);
    var footer = '<div class="airi-chart-footer">' +
      (lastUpdatedStr ? 'Last updated ' + esc(lastUpdatedStr) : '') +
      (data.meta && data.meta.record_count
        ? ' \u00b7 ' + data.meta.record_count.toLocaleString() + ' incidents'
        : '') +
      '</div>';

    // -- Tooltip element --------------------------------------------------
    var tooltip = '<div class="airi-chart-tooltip" role="tooltip" aria-hidden="true"></div>';

    // Inject component styles (scoped to this widget)
    var style = '<style>' +
      '#airi-chart-incidents { position: relative; }' +
      '.airi-chart-band { transition: opacity 0.15s ease; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-band { opacity: 0.25; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-band.is-active { opacity: 1; }' +
      '.airi-chart-legend-item { transition: opacity 0.15s ease; cursor: default; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-legend-item { opacity: 0.35; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-legend-item.is-active { opacity: 1; font-weight: 600; }' +
      '.airi-chart-tooltip { position: absolute; background: #111; color: #fff; padding: 0.6rem 0.75rem; border-radius: 6px; font-size: 0.75rem; pointer-events: none; opacity: 0; transition: opacity 0.12s ease; z-index: 10; font-family: Figtree, sans-serif; max-width: 280px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }' +
      '.airi-chart-tooltip.is-visible { opacity: 1; }' +
      '.airi-chart-tooltip-year { font-weight: 600; margin-bottom: 0.35rem; font-size: 0.8rem; }' +
      '.airi-chart-tooltip-row { display: flex; align-items: center; gap: 0.4rem; justify-content: space-between; gap: 0.75rem; }' +
      '.airi-chart-tooltip-row-label { display: inline-flex; align-items: center; gap: 0.35rem; }' +
      '.airi-chart-tooltip-swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }' +
      '.airi-chart-tooltip-count { font-variant-numeric: tabular-nums; color: #bbb; }' +
      '.airi-chart-tooltip-total { margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px solid #444; font-weight: 600; }' +
      '.airi-chart-footer { text-align: center; font-size: 0.7rem; color: #999; margin-top: 0.5rem; font-family: Figtree, sans-serif; }' +
      '</style>';

    mount.innerHTML = style + svg + legend + footer + tooltip;

    // -- Wire up interactions --------------------------------------------
    var svgEl = mount.querySelector('svg');
    var bands = mount.querySelectorAll('.airi-chart-band');
    var legendItems = mount.querySelectorAll('.airi-chart-legend-item');
    var yearBands = mount.querySelectorAll('.airi-chart-yearband');
    var guide = mount.querySelector('.airi-chart-guide');
    var tooltipEl = mount.querySelector('.airi-chart-tooltip');

    // Domain hover (on band or legend item)
    function activateDomain(d) {
      mount.classList.add('is-hovering');
      bands.forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-domain') === d);
      });
      legendItems.forEach(function (l) {
        l.classList.toggle('is-active', l.getAttribute('data-domain') === d);
      });
    }
    function clearDomain() {
      mount.classList.remove('is-hovering');
      bands.forEach(function (b) { b.classList.remove('is-active'); });
      legendItems.forEach(function (l) { l.classList.remove('is-active'); });
    }

    bands.forEach(function (b) {
      b.addEventListener('mouseenter', function () { activateDomain(b.getAttribute('data-domain')); });
      b.addEventListener('mouseleave', clearDomain);
    });
    legendItems.forEach(function (l) {
      l.addEventListener('mouseenter', function () { activateDomain(l.getAttribute('data-domain')); });
      l.addEventListener('mouseleave', clearDomain);
    });

    // Year hover (tooltip)
    function showTooltip(yr, evt) {
      var s = stacked.find(function (x) { return x.year === yr; });
      if (!s) return;

      // Tooltip content: per-domain counts, sorted descending, skipping zeros
      var rows = s.parts
        .filter(function (p) { return p.v > 0; })
        .sort(function (a, b) { return b.v - a.v; })
        .map(function (p) {
          return '<div class="airi-chart-tooltip-row">' +
            '<span class="airi-chart-tooltip-row-label">' +
            '<span class="airi-chart-tooltip-swatch" style="background:' + (COLORS[p.k] || '#ccc') + '"></span>' +
            esc(p.k) + '</span>' +
            '<span class="airi-chart-tooltip-count">' + p.v + '</span>' +
            '</div>';
        }).join('');

      tooltipEl.innerHTML =
        '<div class="airi-chart-tooltip-year">' + yr + '</div>' +
        rows +
        '<div class="airi-chart-tooltip-row airi-chart-tooltip-total">' +
        '<span>Total</span><span>' + s.total + '</span></div>';

      // Position tooltip next to mouse; clamp within mount bounds
      var mountRect = mount.getBoundingClientRect();
      var tx = evt.clientX - mountRect.left + 14;
      var ty = evt.clientY - mountRect.top + 14;
      var tw = tooltipEl.offsetWidth;
      var th = tooltipEl.offsetHeight;
      if (tx + tw > mountRect.width - 8) tx = evt.clientX - mountRect.left - tw - 14;
      if (ty + th > mountRect.height - 8) ty = mountRect.height - th - 8;
      tooltipEl.style.left = tx + 'px';
      tooltipEl.style.top = ty + 'px';
      tooltipEl.classList.add('is-visible');
      tooltipEl.setAttribute('aria-hidden', 'false');

      // Move the guide line to the year's x position
      var gx = xScale(yr);
      guide.setAttribute('x1', gx);
      guide.setAttribute('x2', gx);
      guide.setAttribute('opacity', '0.4');
    }

    function hideTooltip() {
      tooltipEl.classList.remove('is-visible');
      tooltipEl.setAttribute('aria-hidden', 'true');
      guide.setAttribute('opacity', '0');
    }

    yearBands.forEach(function (r) {
      var yr = parseInt(r.getAttribute('data-year'), 10);
      r.addEventListener('mousemove', function (evt) { showTooltip(yr, evt); });
      r.addEventListener('mouseleave', hideTooltip);
    });
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
