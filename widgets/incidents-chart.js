/**
 * AIRI Incidents stacked area chart (v1.0.5)
 *
 * v1.0.5 — Tighter top margin for closer alignment with text panel
 *          (mT 46 → 28, title y 26 → 22)
 * v1.0.4 — Taller viewBox (700 × 500) for better vertical fill
 * v1.0.3 — Tighten caption spacing: chart hugs bottom of SVG
 *          (preserveAspectRatio=xMidYMax) and caption margins shrink.
 * v1.0.2 — Add "Total incidents" title, top-left, bold black
 * v1.0.1 — SVG fills container in both dimensions
 *          (preserveAspectRatio + height 100% + flex-column root)
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
 *   - Click a year: opens a panel listing top 5 notable incidents (by severity)
 *     with links to the source. Click outside or press Esc to close.
 *   - Last-updated note below chart
 */
(function () {
  var DATA_URL = 'https://jessgrahamuq.github.io/airi-landing-data/data/incidents.json';

  // AIRI brand palette — matches the eyebrow/link colors per dataset panel
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

  // AIRI brand text (primary) and muted gridline colors
  var TEXT_PRIMARY = '#1A1A1A';
  var TEXT_MUTED = '#898A8D';
  var GRID_COLOR = 'rgba(26,26,26,0.18)';

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
        mount.innerHTML = '<div style="color:' + TEXT_MUTED + ';font-size:0.9rem">Data temporarily unavailable.</div>';
      });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function slug(k) {
    return k.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function formatDate(iso) {
    if (!iso) return '';
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
    var notableByYear = data.notable_incidents_by_year || {};

    var W = 700, H = 500, mL = 40, mR = 16, mT = 28, mB = 32; // v1.0.5: tighter top margin (46 → 28)
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

    // ---------- SVG ------------------------------------------------------
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg"' +
      ' role="img" aria-label="AI incidents per year, stacked by risk domain"' +
      ' style="display:block;width:100%;height:100%;font-family:Figtree,sans-serif;">';

    // v1.0.2: chart title, left-aligned to plot, bold black. v1.0.5: title y 26 → 22 for tighter top.
    svg += '<text x="' + mL + '" y="22" text-anchor="start" font-size="18" font-weight="700" fill="' + TEXT_PRIMARY + '">Total incidents</text>';

    [0, 0.25, 0.5, 0.75, 1].forEach(function (p) {
      var v = Math.round(yMax * p);
      var y = yScale(v);
      svg += '<line x1="' + mL + '" y1="' + y + '" x2="' + (W - mR) + '" y2="' + y + '" stroke="' + GRID_COLOR + '"/>';
      svg += '<text x="' + (mL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="' + TEXT_PRIMARY + '">' + v + '</text>';
    });

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

    for (var y = xMin; y <= xMax; y++) {
      svg += '<text x="' + xScale(y) + '" y="' + (H - mB + 16) + '" text-anchor="middle" font-size="11" fill="' + TEXT_PRIMARY + '">' + y + '</text>';
    }

    // Per-year clickable/hoverable bands
    var bandWidth = iw / Math.max(years.length - 1, 1);
    stacked.forEach(function (s) {
      var cx = xScale(s.year);
      svg += '<rect class="airi-chart-yearband" data-year="' + s.year + '" ' +
        'x="' + (cx - bandWidth / 2) + '" y="' + mT + '" ' +
        'width="' + bandWidth + '" height="' + ih + '" ' +
        'fill="transparent" style="cursor:pointer"/>';
    });

    svg += '<line class="airi-chart-guide" x1="0" y1="' + mT + '" x2="0" y2="' + (mT + ih) + '" ' +
      'stroke="' + TEXT_PRIMARY + '" stroke-dasharray="3,3" opacity="0" pointer-events="none"/>';
    svg += '</svg>';

    // ---------- Legend ---------------------------------------------------
    var legend = '<div class="airi-chart-legend">';
    domains.forEach(function (k) {
      legend += '<span class="airi-chart-legend-item" data-domain="' + esc(slug(k)) + '">' +
        '<span class="airi-chart-legend-swatch" style="background:' + (COLORS[k] || '#ccc') + '"></span>' +
        esc(k) + '</span>';
    });
    legend += '</div>';

    // ---------- Footer ---------------------------------------------------
    var lastUpdatedStr = formatDate(data.meta && data.meta.last_updated);
    var footer = '<div class="airi-chart-footer">' +
      (lastUpdatedStr ? 'Last updated ' + esc(lastUpdatedStr) : '') +
      (data.meta && data.meta.record_count
        ? ' \u00b7 ' + data.meta.record_count.toLocaleString() + ' incidents'
        : '') +
      ' \u00b7 <span class="airi-chart-hint">Click a year for notable incidents</span>' +
      '</div>';

    // ---------- Tooltip + Modal ------------------------------------------
    var tooltip = '<div class="airi-chart-tooltip" role="tooltip" aria-hidden="true"></div>';
    var modal = '<div class="airi-chart-modal" role="dialog" aria-modal="true" aria-hidden="true"></div>';

    // ---------- Styles ---------------------------------------------------
    var style = '<style>' +
      '#airi-chart-incidents { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; display: flex; flex-direction: column; height: 100%; }' +
      '.airi-chart-band { transition: opacity 0.15s ease; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-band { opacity: 0.22; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-band.is-active { opacity: 1; }' +
      '.airi-chart-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; margin-top: 4px; font-size: 12px; color: ' + TEXT_PRIMARY + '; }' +
      '.airi-chart-legend-item { display: inline-flex; align-items: center; gap: 5px; transition: opacity 0.15s ease; cursor: default; }' +
      '.airi-chart-legend-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-legend-item { opacity: 0.35; }' +
      '#airi-chart-incidents.is-hovering .airi-chart-legend-item.is-active { opacity: 1; font-weight: 600; }' +
      '.airi-chart-tooltip { position: absolute; background: #111; color: #fff; padding: 10px 12px; border-radius: 6px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.12s ease; z-index: 10; font-family: Figtree, sans-serif; max-width: 280px; line-height: 1.4; box-shadow: 0 4px 14px rgba(0,0,0,0.18); }' +
      '.airi-chart-tooltip.is-visible { opacity: 1; }' +
      '.airi-chart-tooltip-year { font-weight: 600; margin-bottom: 4px; font-size: 13px; }' +
      '.airi-chart-tooltip-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 3px; }' +
      '.airi-chart-tooltip-row-label { display: inline-flex; align-items: center; gap: 6px; }' +
      '.airi-chart-tooltip-swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }' +
      '.airi-chart-tooltip-count { font-variant-numeric: tabular-nums; color: #bbb; }' +
      '.airi-chart-tooltip-total { margin-top: 6px; padding-top: 6px; border-top: 1px solid #444; font-weight: 600; }' +
      '.airi-chart-tooltip-hint { margin-top: 6px; padding-top: 6px; border-top: 1px solid #444; color: #aaa; font-size: 11px; }' +
      '.airi-chart-footer { text-align: center; font-size: 11px; color: ' + TEXT_MUTED + '; margin-top: 4px; font-family: Figtree, sans-serif; }' +
      '.airi-chart-hint { color: ' + TEXT_MUTED + '; }' +
      '.airi-chart-modal { position: absolute; inset: 0; background: rgba(255,255,255,0.98); border-radius: inherit; padding: 1.5rem 1.75rem 1.25rem; opacity: 0; pointer-events: none; transition: opacity 0.18s ease; z-index: 20; overflow-y: auto; font-family: Figtree, sans-serif; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }' +
      '.airi-chart-modal.is-visible { opacity: 1; pointer-events: auto; }' +
      '.airi-chart-modal-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }' +
      '.airi-chart-modal-title { font-size: 1.1rem; font-weight: 600; color: ' + TEXT_PRIMARY + '; margin: 0; }' +
      '.airi-chart-modal-sub { font-size: 0.8rem; color: ' + TEXT_MUTED + '; }' +
      '.airi-chart-modal-close { background: none; border: none; font-size: 1.4rem; line-height: 1; color: ' + TEXT_MUTED + '; cursor: pointer; padding: 0 0.25rem; }' +
      '.airi-chart-modal-close:hover { color: ' + TEXT_PRIMARY + '; }' +
      '.airi-chart-modal-list { list-style: none; margin: 0; padding: 0; }' +
      '.airi-chart-modal-item { display: block; padding: 0.6rem 0; border-top: 1px solid rgba(0,0,0,0.08); }' +
      '.airi-chart-modal-item:first-child { border-top: none; }' +
      '.airi-chart-modal-link { text-decoration: none; color: ' + TEXT_PRIMARY + '; display: block; }' +
      '.airi-chart-modal-link:hover .airi-chart-modal-item-title { text-decoration: underline; }' +
      '.airi-chart-modal-item-title { font-size: 0.9rem; font-weight: 500; line-height: 1.4; color: ' + TEXT_PRIMARY + '; }' +
      '.airi-chart-modal-item-meta { font-size: 0.75rem; color: ' + TEXT_MUTED + '; margin-top: 0.25rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }' +
      '.airi-chart-modal-item-domain { display: inline-flex; align-items: center; gap: 5px; }' +
      '.airi-chart-modal-item-domain-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }' +
      '.airi-chart-modal-empty { color: ' + TEXT_MUTED + '; font-size: 0.9rem; padding: 1rem 0; }' +
      '.airi-chart-modal-footer { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.08); font-size: 0.8rem; }' +
      '.airi-chart-modal-footer a { color: #FC8D62; font-weight: 600; text-decoration: none; }' +
      '.airi-chart-modal-footer a:hover { text-decoration: underline; }' +
      '</style>';

    mount.innerHTML = style + svg + legend + footer + tooltip + modal;

    // ---------- Wire up interactions -------------------------------------
    var bands = mount.querySelectorAll('.airi-chart-band');
    var legendItems = mount.querySelectorAll('.airi-chart-legend-item');
    var yearBands = mount.querySelectorAll('.airi-chart-yearband');
    var guide = mount.querySelector('.airi-chart-guide');
    var tooltipEl = mount.querySelector('.airi-chart-tooltip');
    var modalEl = mount.querySelector('.airi-chart-modal');

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

    function showTooltip(yr, evt) {
      var s = stacked.find(function (x) { return x.year === yr; });
      if (!s) return;
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
      var hasNotable = (notableByYear[String(yr)] || []).length > 0;
      var hint = hasNotable ? '<div class="airi-chart-tooltip-hint">Click to see notable incidents</div>' : '';
      tooltipEl.innerHTML =
        '<div class="airi-chart-tooltip-year">' + yr + '</div>' +
        rows +
        '<div class="airi-chart-tooltip-row airi-chart-tooltip-total">' +
        '<span>Total</span><span>' + s.total + '</span></div>' +
        hint;

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

    function openModal(yr) {
      var items = notableByYear[String(yr)] || [];
      var cta = (data.meta && data.meta.cta_url) || 'https://airisk.mit.edu/ai-incident-tracker';
      var ctaLabel = (data.meta && data.meta.cta_label) || 'See all incidents \u2192';

      var list;
      if (!items.length) {
        list = '<div class="airi-chart-modal-empty">No notable incidents are available for ' + yr + '.</div>';
      } else {
        list = '<ul class="airi-chart-modal-list">' + items.map(function (it) {
          var dateStr = formatDate(it.date);
          var domainDot = it.domain
            ? '<span class="airi-chart-modal-item-domain">' +
              '<span class="airi-chart-modal-item-domain-dot" style="background:' + (COLORS[it.domain] || '#ccc') + '"></span>' +
              esc(it.domain) + '</span>'
            : '';
          return '<li class="airi-chart-modal-item">' +
            '<a class="airi-chart-modal-link" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
            '<div class="airi-chart-modal-item-title">' + esc(it.title) + '</div>' +
            '<div class="airi-chart-modal-item-meta">' +
            (dateStr ? '<span>' + esc(dateStr) + '</span>' : '') +
            (dateStr && domainDot ? '<span>\u00b7</span>' : '') +
            domainDot +
            '</div></a></li>';
        }).join('') + '</ul>';
      }

      modalEl.innerHTML =
        '<div class="airi-chart-modal-header">' +
          '<div>' +
            '<h3 class="airi-chart-modal-title">Notable incidents in ' + yr + '</h3>' +
            '<div class="airi-chart-modal-sub">Ranked by highest severity score</div>' +
          '</div>' +
          '<button class="airi-chart-modal-close" aria-label="Close">\u2715</button>' +
        '</div>' +
        list +
        '<div class="airi-chart-modal-footer"><a href="' + esc(cta) + '" target="_blank" rel="noopener noreferrer">' + esc(ctaLabel) + '</a></div>';

      modalEl.classList.add('is-visible');
      modalEl.setAttribute('aria-hidden', 'false');
      hideTooltip();

      modalEl.querySelector('.airi-chart-modal-close').addEventListener('click', closeModal);
    }

    function closeModal() {
      modalEl.classList.remove('is-visible');
      modalEl.setAttribute('aria-hidden', 'true');
    }

    // Click outside modal body to close
    modalEl.addEventListener('click', function (evt) {
      if (evt.target === modalEl) closeModal();
    });
    // Esc to close
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && modalEl.classList.contains('is-visible')) closeModal();
    });

    yearBands.forEach(function (r) {
      var yr = parseInt(r.getAttribute('data-year'), 10);
      r.addEventListener('mousemove', function (evt) { showTooltip(yr, evt); });
      r.addEventListener('mouseleave', hideTooltip);
      r.addEventListener('click', function () { openModal(yr); });
    });
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
