/**
 * AIRI Governance horizontal stacked bar chart (v1.1.0)
 * Hosted at: https://jessgrahamuq.github.io/airi-landing-data/widgets/governance-chart.js
 *
 * v1.1.0 — REWRITE: horizontal bars, full subdomain names on Y-axis, readable labels
 * v1.0.4 — taller viewBox (1100 x 795) + larger readable label/legend/footer sizes
 * v1.0.3 — all text/lines dark, wider container-tuned viewBox (1100 x 500)
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

  function shortDomain(d) {
    var map = {
      'Discrimination & Toxicity': 'Discrimination & Toxicity',
      'Privacy & Security': 'Privacy & Security',
      'Misinformation': 'Misinformation',
      'Malicious Actors': 'Malicious Actors & Misuse',
      'Human-Computer Interaction': 'Human-Computer Interaction',
      'Socioeconomic & Environmental': 'Socioeconomic & Environmental',
      'AI System Safety, Failures & Limitations': 'AI System Safety'
    };
    return map[d] || d;
  }

  // Truncate long subdomain names if needed
  function subdomainLabel(row) {
    var name = row.full_name || '';
    // Trim very long names gently
    if (name.length > 42) name = name.slice(0, 40) + '…';
    return row.subdomain + ' ' + name;
  }

  function render(mount, data) {
    var series = data.chart.series;
    var levels = data.chart.coverage_levels;
    var topDocs = data.top_documents_by_subdomain || {};

    // Horizontal layout: tall viewBox, Y = subdomains, X = count
    var W = 1100, H = 900;
    var mL = 340;   // left margin for subdomain labels (full names need room)
    var mR = 30;    // right margin
    var mT = 60;    // top margin (legend space)
    var mB = 70;    // bottom margin (axis + footer text)
    var iw = W - mL - mR;
    var ih = H - mT - mB;

    // Calculate xMax for axis scale
    var xMax = Math.max.apply(null, series.map(function (r) { return r.total; })) || 1;

    // We need to account for domain group headers. Each domain group gets a header row.
    var domainGroups = [];
    var curGroup = null;
    series.forEach(function (row, i) {
      if (!curGroup || curGroup.domain !== row.domain) {
        curGroup = { domain: row.domain, startIdx: i, items: [] };
        domainGroups.push(curGroup);
      }
      curGroup.items.push({ row: row, idx: i });
    });

    // Row layout calculation:
    // Each domain group has: 1 header row (headerH) + N data rows (rowH each) + gap between groups
    var headerH = 20;   // domain header label height
    var rowH;           // computed from available space
    var groupGap = 8;   // gap after each group
    var totalHeaders = domainGroups.length;
    var totalRows = series.length;
    var totalGaps = domainGroups.length - 1;
    // ih = totalHeaders * headerH + totalRows * rowH + totalGaps * groupGap
    rowH = (ih - totalHeaders * headerH - totalGaps * groupGap) / totalRows;
    var barH = Math.max(10, rowH * 0.72);

    function xScale(v) { return mL + (v / xMax) * iw; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Governance document coverage by risk subdomain" style="display:block;width:100%;height:auto;font-family:Figtree,sans-serif;">';

    // X-axis grid (vertical lines at count intervals)
    var xTicks = 5;
    for (var t = 0; t <= xTicks; t++) {
      var v = Math.round((xMax * t) / xTicks);
      var x = xScale(v);
      svg += '<line x1="' + x + '" y1="' + mT + '" x2="' + x + '" y2="' + (mT + ih) + '" stroke="' + GRID_COLOR + '"/>';
      svg += '<text x="' + x + '" y="' + (mT - 8) + '" text-anchor="middle" font-size="14" fill="' + TEXT_PRIMARY + '">' + v + '</text>';
    }

    // X-axis title
    svg += '<text x="' + (mL + iw / 2) + '" y="' + (H - mB + 45) + '" text-anchor="middle" font-size="13" fill="' + TEXT_MUTED + '" font-weight="500">Number of documents</text>';

    // Iterate domain groups, draw header + bars
    var y = mT;
    domainGroups.forEach(function (group, gIdx) {
      var domColor = COLORS[group.domain] || '#ccc';

      // Domain header bar — colored stripe + label
      svg += '<rect x="' + (mL - 12) + '" y="' + y + '" width="6" height="' + headerH + '" fill="' + domColor + '" rx="2"/>';
      svg += '<text x="' + (mL - 20) + '" y="' + (y + headerH / 2 + 5) + '" text-anchor="end" font-size="14" font-weight="700" fill="' + TEXT_PRIMARY + '">' + esc(shortDomain(group.domain).toUpperCase()) + '</text>';
      y += headerH;

      // Data rows
      group.items.forEach(function (it) {
        var row = it.row;
        var rowY = y + (rowH - barH) / 2;
        var color = domColor;

        // Subdomain label on the left
        svg += '<text x="' + (mL - 12) + '" y="' + (y + rowH / 2 + 5) + '" text-anchor="end" font-size="13" fill="' + TEXT_PRIMARY + '">' + esc(subdomainLabel(row)) + '</text>';

        // Stacked horizontal segments
        var accumX = mL;
        levels.forEach(function (lvl) {
          var c = row[lvl] || 0;
          if (c === 0) return;
          var segW = (c / xMax) * iw;
          svg += '<rect class="airi-gchart-seg" data-subdomain="' + esc(row.subdomain) + '" data-level="' + esc(lvl) + '" x="' + accumX.toFixed(2) + '" y="' + rowY.toFixed(2) + '" width="' + segW.toFixed(2) + '" height="' + barH.toFixed(2) + '" fill="' + color + '" opacity="' + COVERAGE_STYLE[lvl].opacity + '"/>';
          accumX += segW;
        });

        // Total count at the end of the bar
        if (row.total > 0) {
          svg += '<text x="' + (accumX + 6).toFixed(2) + '" y="' + (y + rowH / 2 + 5) + '" font-size="12" fill="' + TEXT_MUTED + '">' + row.total + '</text>';
        }

        // Invisible hit rect for hover/click
        svg += '<rect class="airi-gchart-hit" data-subdomain="' + esc(row.subdomain) + '" x="' + mL + '" y="' + y + '" width="' + iw + '" height="' + rowH + '" fill="transparent" style="cursor:pointer"/>';

        y += rowH;
      });

      // Gap between groups
      if (gIdx < domainGroups.length - 1) y += groupGap;
    });

    svg += '</svg>';

    // Legend — inline at the top
    var legend = '<div class="airi-gchart-legend">';
    levels.forEach(function (lvl) {
      legend += '<span class="airi-gchart-legend-item"><span class="airi-gchart-legend-swatch" style="background:' + TEXT_PRIMARY + ';opacity:' + COVERAGE_STYLE[lvl].opacity + '"></span>' + esc(COVERAGE_STYLE[lvl].label) + '</span>';
    });
    legend += '</div>';

    var lu = formatDate(data.meta && data.meta.last_updated);
    var footer = '<div class="airi-gchart-footer">' + (lu ? 'Last updated ' + esc(lu) : '') + (data.meta && data.meta.record_count ? ' \u00b7 ' + data.meta.record_count.toLocaleString() + ' governance documents' : '') + ' \u00b7 <span class="airi-gchart-hint">Click a row to see documents</span></div>';

    var tooltip = '<div class="airi-gchart-tooltip" role="tooltip" aria-hidden="true"></div>';
    var modal = '<div class="airi-gchart-modal" role="dialog" aria-modal="true" aria-hidden="true"></div>';

    var style = '<style>' +
      '#airi-chart-governance { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; }' +
      '.airi-gchart-seg { transition: opacity 0.15s ease; }' +
      '.airi-gchart-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; justify-content: center; margin-bottom: 8px; font-size: 14px; color: ' + TEXT_PRIMARY + '; }' +
      '.airi-gchart-legend-item { display: inline-flex; align-items: center; gap: 6px; }' +
      '.airi-gchart-legend-swatch { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }' +
      '.airi-gchart-tooltip { position: absolute; background: #111; color: #fff; padding: 10px 12px; border-radius: 6px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.12s ease; z-index: 10; font-family: Figtree, sans-serif; max-width: 280px; line-height: 1.4; box-shadow: 0 4px 14px rgba(0,0,0,0.18); }' +
      '.airi-gchart-tooltip.is-visible { opacity: 1; }' +
      '.airi-gchart-tt-sub { font-weight: 600; margin-bottom: 2px; font-size: 13px; }' +
      '.airi-gchart-tt-dom { font-size: 11px; color: #aaa; margin-bottom: 4px; }' +
      '.airi-gchart-tt-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 3px; }' +
      '.airi-gchart-tt-label { display: inline-flex; align-items: center; gap: 6px; }' +
      '.airi-gchart-tt-swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }' +
      '.airi-gchart-tt-count { font-variant-numeric: tabular-nums; color: #bbb; }' +
      '.airi-gchart-tt-total { margin-top: 6px; padding-top: 6px; border-top: 1px solid #444; font-weight: 600; }' +
      '.airi-gchart-tt-hint { margin-top: 6px; padding-top: 6px; border-top: 1px solid #444; color: #aaa; font-size: 11px; }' +
      '.airi-gchart-footer { text-align: center; font-size: 13px; color: ' + TEXT_PRIMARY + '; margin-top: 8px; font-family: Figtree, sans-serif; }' +
      '.airi-gchart-hint { color: ' + TEXT_MUTED + '; }' +
      '.airi-gchart-modal { position: absolute; inset: 0; background: rgba(255,255,255,0.98); border-radius: inherit; padding: 1.5rem 1.75rem 1.25rem; opacity: 0; pointer-events: none; transition: opacity 0.18s ease; z-index: 20; overflow-y: auto; font-family: Figtree, sans-serif; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }' +
      '.airi-gchart-modal.is-visible { opacity: 1; pointer-events: auto; }' +
      '.airi-gchart-modal-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }' +
      '.airi-gchart-modal-title { font-size: 1.05rem; font-weight: 600; color: ' + TEXT_PRIMARY + '; margin: 0; line-height: 1.3; }' +
      '.airi-gchart-modal-sub { font-size: 0.8rem; color: ' + TEXT_MUTED + '; margin-top: 0.15rem; }' +
      '.airi-gchart-modal-close { background: none; border: none; font-size: 1.4rem; line-height: 1; color: ' + TEXT_MUTED + '; cursor: pointer; padding: 0 0.25rem; flex-shrink: 0; }' +
      '.airi-gchart-modal-close:hover { color: ' + TEXT_PRIMARY + '; }' +
      '.airi-gchart-modal-list { list-style: none; margin: 0; padding: 0; }' +
      '.airi-gchart-modal-item { display: block; padding: 0.6rem 0; border-top: 1px solid rgba(0,0,0,0.08); }' +
      '.airi-gchart-modal-item:first-child { border-top: none; }' +
      '.airi-gchart-modal-link { text-decoration: none; color: ' + TEXT_PRIMARY + '; display: block; }' +
      '.airi-gchart-modal-link:hover .airi-gchart-modal-item-title { text-decoration: underline; }' +
      '.airi-gchart-modal-item-title { font-size: 0.9rem; font-weight: 500; line-height: 1.4; color: ' + TEXT_PRIMARY + '; }' +
      '.airi-gchart-modal-item-meta { font-size: 0.75rem; color: ' + TEXT_MUTED + '; margin-top: 0.25rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }' +
      '.airi-gchart-modal-item-level { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; color: ' + TEXT_PRIMARY + '; }' +
      '.airi-gchart-modal-item-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }' +
      '.airi-gchart-modal-empty { color: ' + TEXT_MUTED + '; font-size: 0.9rem; padding: 1rem 0; }' +
      '.airi-gchart-modal-footer { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.08); font-size: 0.8rem; }' +
      '.airi-gchart-modal-footer a { color: #A6D854; font-weight: 600; text-decoration: none; }' +
      '.airi-gchart-modal-footer a:hover { text-decoration: underline; }' +
      '</style>';

    mount.innerHTML = style + legend + svg + footer + tooltip + modal;

    var segs = mount.querySelectorAll('.airi-gchart-seg');
    var hits = mount.querySelectorAll('.airi-gchart-hit');
    var tooltipEl = mount.querySelector('.airi-gchart-tooltip');
    var modalEl = mount.querySelector('.airi-gchart-modal');

    function highlightRow(code) {
      segs.forEach(function (s) {
        var isRow = s.getAttribute('data-subdomain') === code;
        if (isRow) {
          s.style.opacity = COVERAGE_STYLE[s.getAttribute('data-level')].opacity;
        } else {
          s.style.opacity = COVERAGE_STYLE[s.getAttribute('data-level')].opacity * 0.25;
        }
      });
    }
    function clearHighlight() {
      segs.forEach(function (s) {
        s.style.opacity = COVERAGE_STYLE[s.getAttribute('data-level')].opacity;
      });
    }

    function showTooltip(code, evt) {
      var row = series.find(function (r) { return r.subdomain === code; });
      if (!row) return;
      var color = COLORS[row.domain] || '#ccc';
      var rows = levels.map(function (lvl) {
        var c = row[lvl] || 0;
        return '<div class="airi-gchart-tt-row"><span class="airi-gchart-tt-label"><span class="airi-gchart-tt-swatch" style="background:' + color + ';opacity:' + COVERAGE_STYLE[lvl].opacity + '"></span>' + esc(COVERAGE_STYLE[lvl].label) + '</span><span class="airi-gchart-tt-count">' + c + '</span></div>';
      }).join('');
      var hasDocs = (topDocs[code] || []).length > 0;
      var hint = hasDocs ? '<div class="airi-gchart-tt-hint">Click to see documents</div>' : '';
      tooltipEl.innerHTML =
        '<div class="airi-gchart-tt-sub">' + esc(row.subdomain + ' ' + row.full_name) + '</div>' +
        '<div class="airi-gchart-tt-dom">' + esc(row.domain) + '</div>' +
        rows +
        '<div class="airi-gchart-tt-row airi-gchart-tt-total"><span>Total</span><span>' + row.total + '</span></div>' +
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
    }

    function hideTooltip() {
      tooltipEl.classList.remove('is-visible');
      tooltipEl.setAttribute('aria-hidden', 'true');
    }

    function openModal(code) {
      var row = series.find(function (r) { return r.subdomain === code; });
      if (!row) return;
      var items = topDocs[code] || [];
      var cta = (data.meta && data.meta.cta_url) || 'https://airisk.mit.edu/ai-governance';
      var ctaLabel = (data.meta && data.meta.cta_label) || 'Explore the mapping \u2192';
      var domColor = COLORS[row.domain] || '#ccc';

      var list;
      if (!items.length) {
        list = '<div class="airi-gchart-modal-empty">No documents with source links are available for this subdomain yet.</div>';
      } else {
        list = '<ul class="airi-gchart-modal-list">' + items.map(function (it) {
          var metaBits = [];
          if (it.jurisdiction) metaBits.push('<span>' + esc(it.jurisdiction) + '</span>');
          if (it.authority) metaBits.push('<span>' + esc(it.authority) + '</span>');
          if (it.legislative_status) metaBits.push('<span>' + esc(it.legislative_status) + '</span>');
          var levelBadge = it.level
            ? '<span class="airi-gchart-modal-item-level"><span class="airi-gchart-modal-item-dot" style="background:' + domColor + ';opacity:' + (COVERAGE_STYLE[it.level] ? COVERAGE_STYLE[it.level].opacity : 1) + '"></span>' + esc(it.level + ' coverage') + '</span>'
            : '';
          var metaLine = metaBits.join(' <span>\u00b7</span> ');
          return '<li class="airi-gchart-modal-item"><a class="airi-gchart-modal-link" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer"><div class="airi-gchart-modal-item-title">' + esc(it.title) + '</div><div class="airi-gchart-modal-item-meta">' + levelBadge + (levelBadge && metaLine ? ' <span>\u00b7</span> ' : '') + metaLine + '</div></a></li>';
        }).join('') + '</ul>';
      }

      modalEl.innerHTML =
        '<div class="airi-gchart-modal-header">' +
          '<div>' +
            '<h3 class="airi-gchart-modal-title">' + esc(row.subdomain + ' ' + row.full_name) + '</h3>' +
            '<div class="airi-gchart-modal-sub">' + esc(row.domain) + ' \u00b7 ' + row.total + ' governance documents</div>' +
          '</div>' +
          '<button class="airi-gchart-modal-close" aria-label="Close">\u2715</button>' +
        '</div>' +
        list +
        '<div class="airi-gchart-modal-footer"><a href="' + esc(cta) + '" target="_blank" rel="noopener noreferrer">' + esc(ctaLabel) + '</a></div>';

      modalEl.classList.add('is-visible');
      modalEl.setAttribute('aria-hidden', 'false');
      hideTooltip();
      clearHighlight();

      modalEl.querySelector('.airi-gchart-modal-close').addEventListener('click', closeModal);
    }

    function closeModal() {
      modalEl.classList.remove('is-visible');
      modalEl.setAttribute('aria-hidden', 'true');
    }

    modalEl.addEventListener('click', function (evt) {
      if (evt.target === modalEl) closeModal();
    });
    document.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape' && modalEl.classList.contains('is-visible')) closeModal();
    });

    hits.forEach(function (r) {
      var code = r.getAttribute('data-subdomain');
      r.addEventListener('mouseenter', function () { highlightRow(code); });
      r.addEventListener('mousemove', function (evt) { showTooltip(code, evt); });
      r.addEventListener('mouseleave', function () { hideTooltip(); clearHighlight(); });
      r.addEventListener('click', function () { openModal(code); });
    });
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
