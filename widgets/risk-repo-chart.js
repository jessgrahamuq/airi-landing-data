/**
 * AIRI Risk Repository causal taxonomy matrix (v1.0.8)
 *
 * v1.0.8 — Slightly taller: data cell padding 14 → 20, domain cell
 *          padding 12 → 16, column subheader padding 10 → 12,
 *          section header padding 10 → 12.
 * v1.0.7 — Less tall: data cell padding 28 → 14, domain cell
 *          padding 24 → 12, column subheader padding 16 → 10,
 *          section header padding 14 → 10. Whole matrix shrinks
 *          in height without changing layout.
 * v1.0.6 — Taller again: data cell padding 18 → 28, domain cell
 *          padding 16 → 24, column subheader padding 12 → 16,
 *          section header padding 11 → 14. Whole matrix grows in
 *          height without changing layout.
 * v1.0.5 — Single grid for header + body rows (guarantees Entity /
 *          Intent / Timing section headers line up exactly with their
 *          3-column blocks below). Taller data rows (padding 14 → 18)
 *          and taller domain cell (padding 12 → 16) for breathing room.
 * v1.0.4 — Drop forced full-container height so the widget sizes to
 *          matrix + legend + footer (no trailing blank below footer).
 * v1.0.3 — Tighter top margin N/A (HTML grid has no viewBox / mT);
 *          matrix already starts at the top of its mount div.
 * v1.0.2 — Tighten caption spacing (legend + footer hug the matrix)
 * v1.0.1 — Root container fills parent height (flex-column + height 100%)
 *          so the matrix stretches to fill its mount div. Matrix renders as
 *          an HTML grid (not SVG), so no preserveAspectRatio change needed.
 *
 * Mounts into an element with id="airi-chart-risk-repo".
 * Fetches from /data/risk_repo.json in the same repo.
 *
 * Hosted at:
 *   https://jessgrahamuq.github.io/airi-landing-data/widgets/risk-repo-chart.js
 *
 * Visual: HTML grid. 7 domain rows x 9 columns (3 sections x 3 options).
 *   Entity: Human | AI | Other           (AIRI Privacy teal)
 *   Intent: Intentional | Unintentional | Other  (AIRI Discrimination red)
 *   Timing: Pre-deployment | Post-deployment | Other  (AIRI HCI blue)
 *   Cell value: % of risks in that domain with that causal code.
 *   Color intensity of each cell scales 0-100% within its section.
 */
(function () {
  var DATA_URL = 'https://jessgrahamuq.github.io/airi-landing-data/data/risk_repo.json';

  var TEXT_PRIMARY = '#1A1A1A';
  var TEXT_MUTED = '#898A8D';

  // AIRI section ramp base colors (AIRI palette picks)
  var SECTION_RGB = {
    'Entity': [102, 194, 165],  // #66C2A5 Privacy teal
    'Intent': [163, 32, 53],    // #A32035 Discrimination red
    'Timing': [141, 160, 203]   // #8DA0CB HCI blue
  };

  function run() {
    var mount = document.getElementById('airi-chart-risk-repo');
    if (!mount) return;
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { render(mount, data); })
      .catch(function (err) {
        console.error('[airi-risk-repo-chart]', err);
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

  function rampFill(rgb, pct) {
    // 0% = near-white (soft tint), 100% = full base color.
    var t = pct / 100;
    var r = Math.round(255 - (255 - rgb[0]) * (0.18 + t * 0.82));
    var g = Math.round(255 - (255 - rgb[1]) * (0.18 + t * 0.82));
    var b = Math.round(255 - (255 - rgb[2]) * (0.18 + t * 0.82));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function cellTextColor(pct) {
    return pct >= 50 ? '#ffffff' : TEXT_PRIMARY;
  }

  function render(mount, data) {
    var sections = data.sections || [];
    var domains = data.domains || [];

    var cols = '220px repeat(9, 1fr)';

    var html = '';

    html += '<style>' +
      '#airi-chart-risk-repo { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; font-size: 13px; display: flex; flex-direction: column; }' +
      '.rr-footer { text-align: center; font-size: 11px; color: ' + TEXT_MUTED + '; margin-top: 4px; }' +
      '.rr-legend { display: flex; gap: 28px; margin-top: 6px; font-size: 11px; color: ' + TEXT_MUTED + '; flex-wrap: wrap; justify-content: center; }' +
      '.rr-legend-item { display: flex; align-items: center; gap: 6px; }' +
      '.rr-legend-swatch { display: inline-block; width: 56px; height: 10px; border-radius: 2px; border: 0.5px solid rgba(0,0,0,0.1); }' +
      '</style>';

    // v1.0.5: single grid container for the whole table, so section headers
    // (each spanning 3 columns) share the exact same grid tracks as the
    // per-column subheaders and data cells beneath them. Eliminates any
    // inter-grid width drift between the old two-container layout.
    html += '<div style="display:grid;grid-template-columns:' + cols + ';gap:0;border:1px solid rgba(0,0,0,0.06);border-radius:8px;overflow:hidden;">';

    // Row 1 — section headers (empty corner + 3 × span-3 colored blocks)
    html += '<div style="background:#fff;"></div>';
    sections.forEach(function (sec) {
      html += '<div style="grid-column:span 3;background:' + sec.accent + ';color:#fff;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;display:flex;align-items:center;justify-content:center;padding:12px 0;">' + esc(sec.title) + '</div>';
    });

    // Row 2 — column subheaders (Domain + 9 individual columns)
    html += '<div style="background:#fff;padding:12px 12px;font-size:11px;color:' + TEXT_MUTED + ';border-top:1px solid rgba(0,0,0,0.06);border-bottom:1px solid rgba(0,0,0,0.06);">Domain</div>';
    sections.forEach(function (sec, si) {
      sec.cols.forEach(function (col, ci) {
        var borderLeft = (si > 0 && ci === 0) ? '1px solid rgba(0,0,0,0.08)' : 'none';
        html += '<div style="background:#fff;padding:12px 6px;font-size:11px;color:' + TEXT_PRIMARY + ';text-align:center;border-top:1px solid rgba(0,0,0,0.06);border-bottom:1px solid rgba(0,0,0,0.06);border-left:' + borderLeft + ';">' + esc(col) + '</div>';
      });
    });

    // Data rows
    domains.forEach(function (d, di) {
      var isLast = di === domains.length - 1;
      var bottomBorder = isLast ? 'none' : '1px solid rgba(0,0,0,0.06)';

      html += '<div style="display:flex;align-items:stretch;background:#fff;border-bottom:' + bottomBorder + ';">' +
        '<div style="width:4px;background:' + d.color + ';flex-shrink:0;"></div>' +
        '<div style="flex:1;padding:16px 12px;font-size:12.5px;line-height:1.3;">' + esc(d.id + ' ' + d.name) + '</div>' +
        '</div>';

      sections.forEach(function (sec, si) {
        var rgb = SECTION_RGB[sec.key] || [200, 200, 200];
        sec.cols.forEach(function (col, ci) {
          var val = (d[sec.key] && d[sec.key][col]) || 0;
          var fill = rampFill(rgb, val);
          var tc = cellTextColor(val);
          var borderLeft = (si > 0 && ci === 0) ? '1px solid rgba(0,0,0,0.08)' : 'none';
          html += '<div style="background:' + fill + ';border-bottom:' + bottomBorder + ';border-left:' + borderLeft + ';display:flex;align-items:center;justify-content:center;padding:20px 4px;font-size:12px;font-weight:500;color:' + tc + ';">' + val + '%</div>';
        });
      });
    });

    html += '</div>';

    // Legend
    html += '<div class="rr-legend">';
    sections.forEach(function (sec) {
      var rgb = SECTION_RGB[sec.key] || [200, 200, 200];
      html += '<div class="rr-legend-item">' +
        '<span style="color:' + sec.accent + ';font-weight:500;">' + esc(sec.title) + '</span>' +
        '<span class="rr-legend-swatch" style="background:linear-gradient(to right, ' + rampFill(rgb, 0) + ', ' + rampFill(rgb, 100) + ');"></span>' +
        '<span>0 \u2013 100%</span>' +
        '</div>';
    });
    html += '</div>';

    // Footer
    var lu = formatDate(data.meta && data.meta.last_updated);
    var footerBits = [];
    if (data.meta && data.meta.record_count) {
      footerBits.push(data.meta.record_count.toLocaleString() + ' risks');
    }
    if (data.meta && data.meta.document_count) {
      footerBits.push(data.meta.document_count + ' source documents');
    }
    if (data.meta && data.meta.domain_count) {
      footerBits.push(data.meta.domain_count + ' domains');
    }
    if (lu) {
      footerBits.push('Last updated ' + lu);
    }
    html += '<div class="rr-footer">' + esc(footerBits.join(' \u00b7 ')) + '</div>';

    mount.innerHTML = html;
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
