/**
 * AIRI Delphi butterfly chart (v1.1.3)
 *
 * v1.1.3 — Tighter top margin for closer alignment with text panel
 *          (TOP_AREA 84 → 50, axis titles y 40 → 22, ticks y 72 → 42)
 * v1.1.2 — Larger in-chart text (tick %s, actor names, bar labels,
 *          legend) and darker gridlines + tick numbers for readability.
 * v1.1.1 — Taller viewBox (~900 × 1000) via bigger ROW_H and BAR_H
 *          for better vertical fill / more generous per-actor spacing.
 * v1.1.0 — REDESIGN: small-multiples. Show one butterfly per actor
 *          (7 stacked rows) for a selected risk, with alternating
 *          background stripes for per-actor segmentation. Axis titles
 *          ("Vulnerability" / "Responsibility") enlarged. Actor dropdown
 *          removed — all actors visible at once.
 * v1.0.2 — Tighten caption spacing above and below the chart
 * v1.0.1 — SVG fills container in both dimensions
 *          (preserveAspectRatio + height 100% + flex-column root)
 *
 * Mounts into an element with id="airi-chart-delphi".
 * Fetches from /data/delphi.json in the same repo.
 *
 * Hosted at:
 *   https://jessgrahamuq.github.io/airi-landing-data/widgets/delphi-chart.js
 *
 * Visual: small-multiples butterfly chart. One butterfly per actor (7 rows),
 *   stacked vertically for the selected risk.
 *   Left side: Vulnerability stacked by 5 Likert levels (strongest near center).
 *   Right side: Responsibility stacked by 5 Likert levels (strongest near center).
 *   Risk dropdown lets user pick among 24 risks. Round 3 only.
 */
(function () {
  var DATA_URL = 'https://jessgrahamuq.github.io/airi-landing-data/data/delphi.json';

  var VULN_COLOR = '#8DA0CB';  // AIRI HCI blue
  var RESP_COLOR = '#66C2A5';  // AIRI Privacy teal
  var TEXT_PRIMARY = '#1A1A1A';
  var TEXT_MUTED = '#898A8D';

  function run() {
    var mount = document.getElementById('airi-chart-delphi');
    if (!mount) return;
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { render(mount, data); })
      .catch(function (err) {
        console.error('[airi-delphi-chart]', err);
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

  function opacityFor(index, total) {
    // index 0 = weakest, total-1 = strongest
    return 0.2 + (index / Math.max(total - 1, 1)) * 0.8;
  }

  function render(mount, data) {
    var state = { riskId: data.risks[0].number };
    var respLevels = data.levels.Responsibility;
    var vulnLevels = data.levels.Vulnerability;
    var actors = data.actors;

    var style = '<style>' +
      '#airi-chart-delphi { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; display: flex; flex-direction: column; height: 100%; }' +
      '.delphi-controls { display: flex; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }' +
      '.delphi-control { flex: 1; min-width: 220px; }' +
      '.delphi-control label { font-size: 11px; color: ' + TEXT_MUTED + '; display: block; margin-bottom: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em; }' +
      '.delphi-control select { width: 100%; padding: 8px 10px; border: 0.5px solid rgba(0,0,0,0.25); border-radius: 6px; font-size: 13px; font-family: inherit; background: #fff; color: ' + TEXT_PRIMARY + '; cursor: pointer; }' +
      '.delphi-control select:hover { border-color: rgba(0,0,0,0.45); }' +
      '.delphi-control select:focus { outline: none; border-color: ' + VULN_COLOR + '; box-shadow: 0 0 0 2px rgba(141,160,203,0.2); }' +
      '.delphi-footer { text-align: center; font-size: 11px; color: ' + TEXT_MUTED + '; margin-top: 4px; }' +
      '</style>';

    function doRender() {
      var riskData = data.data[state.riskId];
      if (!riskData) {
        mount.innerHTML = style + '<div style="color:' + TEXT_MUTED + ';padding:2rem;text-align:center;">No data for this risk.</div>';
        return;
      }

      // ---------- Layout --------------------------------------------------
      var W = 900;
      var ROW_H = 124;           // v1.1.1: per-actor row height (bumped for taller viewBox)
      var BAR_H = 60;            // v1.1.1: butterfly bar height (bumped)
      var TOP_AREA = 50;         // v1.1.3: axis titles + tick labels (was 84)
      var LEGEND_H = 48;         // legend band at bottom
      var SIDE_PAD = 30;
      var H = TOP_AREA + actors.length * ROW_H + LEGEND_H;
      var cx = W / 2;
      var halfPlot = (W / 2) - SIDE_PAD;
      var scale = halfPlot / 100;
      var gridTop = TOP_AREA;
      var gridBottom = TOP_AREA + actors.length * ROW_H;

      var controls = '<div class="delphi-controls">' +
        '<div class="delphi-control"><label>Risk</label>' +
        '<select id="delphi-risk-select">' +
        data.risks.map(function (r) {
          return '<option value="' + esc(r.number) + '"' + (r.number === state.riskId ? ' selected' : '') + '>' + esc(r.number + ' ' + r.name) + '</option>';
        }).join('') +
        '</select></div></div>';

      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Delphi butterfly chart of vulnerability and responsibility per actor for selected risk" style="display:block;width:100%;height:100%;font-family:Figtree,sans-serif;">';

      // ---------- Alternating row backgrounds (segmentation) -------------
      actors.forEach(function (actor, ai) {
        if (ai % 2 === 0) {
          var yBase = TOP_AREA + ai * ROW_H;
          svg += '<rect x="0" y="' + yBase + '" width="' + W + '" height="' + ROW_H + '" fill="#f5f6f8"/>';
        }
      });

      // ---------- Gridlines + center axis -------------------------------
      var ticks = [25, 50, 75, 100];
      // v1.1.2: darker gridlines — primary color with subtle dashes so they're visible but not dominant
      ticks.forEach(function (t) {
        var xR = cx + t * scale;
        var xL = cx - t * scale;
        svg += '<line x1="' + xR + '" y1="' + gridTop + '" x2="' + xR + '" y2="' + gridBottom + '" stroke="' + TEXT_PRIMARY + '" stroke-width="0.8" stroke-dasharray="2,4" opacity="0.4"/>';
        svg += '<line x1="' + xL + '" y1="' + gridTop + '" x2="' + xL + '" y2="' + gridBottom + '" stroke="' + TEXT_PRIMARY + '" stroke-width="0.8" stroke-dasharray="2,4" opacity="0.4"/>';
      });
      svg += '<line x1="' + cx + '" y1="' + gridTop + '" x2="' + cx + '" y2="' + gridBottom + '" stroke="' + TEXT_PRIMARY + '" stroke-width="1.2"/>';

      // ---------- Big axis titles (Vulnerability / Responsibility) ------
      // v1.1.3: titles moved up from y=40 to y=22 for tighter top margin
      svg += '<text x="' + (cx - 24) + '" y="22" text-anchor="end" font-size="22" font-weight="700" fill="' + VULN_COLOR + '">Vulnerability \u2190</text>';
      svg += '<text x="' + (cx + 24) + '" y="22" text-anchor="start" font-size="22" font-weight="700" fill="' + RESP_COLOR + '">\u2192 Responsibility</text>';

      // ---------- Tick labels at top (above the first row) --------------
      // v1.1.2: bigger + darker. v1.1.3: moved up from y=72 to y=42 (sits between titles and plot)
      ticks.forEach(function (t) {
        svg += '<text x="' + (cx + t * scale) + '" y="42" text-anchor="middle" font-size="14" font-weight="600" fill="' + TEXT_PRIMARY + '">' + t + '%</text>';
        svg += '<text x="' + (cx - t * scale) + '" y="42" text-anchor="middle" font-size="14" font-weight="600" fill="' + TEXT_PRIMARY + '">' + t + '%</text>';
      });

      // ---------- Per-actor butterfly rows ------------------------------
      actors.forEach(function (actor, ai) {
        var actorData = riskData[actor];
        if (!actorData) return;
        var yBase = TOP_AREA + ai * ROW_H;

        // Actor name (left-aligned inside its row) — v1.1.2: bigger
        svg += '<text x="' + SIDE_PAD + '" y="' + (yBase + 18) + '" text-anchor="start" font-size="16" font-weight="700" fill="' + TEXT_PRIMARY + '">' + esc(actor) + '</text>';

        var barY = yBase + 32; // v1.1.2: drop bar a bit to clear bigger actor label

        // Responsibility (right) — strongest near center
        var xOffR = cx;
        for (var i = respLevels.length - 1; i >= 0; i--) {
          var levelR = respLevels[i];
          var valR = actorData.Responsibility[levelR] || 0;
          if (valR === 0) continue;
          var wR = valR * scale;
          var opR = opacityFor(i, respLevels.length);
          svg += '<rect x="' + xOffR + '" y="' + barY + '" width="' + wR + '" height="' + BAR_H + '" fill="' + RESP_COLOR + '" fill-opacity="' + opR + '"/>';
          if (wR > 32) {
            svg += '<text x="' + (xOffR + wR / 2) + '" y="' + (barY + BAR_H / 2 + 5) + '" text-anchor="middle" font-size="14" font-weight="600" fill="' + (opR > 0.6 ? '#fff' : TEXT_PRIMARY) + '">' + valR.toFixed(0) + '%</text>';
          }
          xOffR += wR;
        }

        // Vulnerability (left) — strongest near center
        var xOffL = cx;
        for (var j = vulnLevels.length - 1; j >= 0; j--) {
          var levelV = vulnLevels[j];
          var valV = actorData.Vulnerability[levelV] || 0;
          if (valV === 0) continue;
          var wV = valV * scale;
          var opV = opacityFor(j, vulnLevels.length);
          svg += '<rect x="' + (xOffL - wV) + '" y="' + barY + '" width="' + wV + '" height="' + BAR_H + '" fill="' + VULN_COLOR + '" fill-opacity="' + opV + '"/>';
          if (wV > 32) {
            svg += '<text x="' + (xOffL - wV / 2) + '" y="' + (barY + BAR_H / 2 + 5) + '" text-anchor="middle" font-size="14" font-weight="600" fill="' + (opV > 0.6 ? '#fff' : TEXT_PRIMARY) + '">' + valV.toFixed(0) + '%</text>';
          }
          xOffL -= wV;
        }
      });

      // ---------- Legend at the bottom ---------------------------------
      // v1.1.2: bigger legend swatches + text
      var legendY = gridBottom + 20;
      var lgLeftWidth = (cx - 40) / vulnLevels.length;
      for (var li = vulnLevels.length - 1; li >= 0; li--) {
        var lvlName = vulnLevels[li];
        var lx = 20 + (vulnLevels.length - 1 - li) * lgLeftWidth;
        svg += '<rect x="' + lx + '" y="' + legendY + '" width="14" height="14" fill="' + VULN_COLOR + '" fill-opacity="' + opacityFor(li, vulnLevels.length) + '"/>';
        svg += '<text x="' + (lx + 19) + '" y="' + (legendY + 12) + '" font-size="13" fill="' + TEXT_PRIMARY + '">' + esc(lvlName) + '</text>';
      }
      var lgRightWidth = (cx - 40) / respLevels.length;
      for (var ri = respLevels.length - 1; ri >= 0; ri--) {
        var lvlName2 = respLevels[ri];
        var lx2 = cx + 20 + (respLevels.length - 1 - ri) * lgRightWidth;
        svg += '<rect x="' + lx2 + '" y="' + legendY + '" width="14" height="14" fill="' + RESP_COLOR + '" fill-opacity="' + opacityFor(ri, respLevels.length) + '"/>';
        svg += '<text x="' + (lx2 + 19) + '" y="' + (legendY + 12) + '" font-size="13" fill="' + TEXT_PRIMARY + '">' + esc(lvlName2) + '</text>';
      }

      svg += '</svg>';

      // ---------- Footer -----------------------------------------------
      var firstActor = actors.find(function (a) { return riskData[a]; });
      var nApprox = firstActor ? (riskData[firstActor].n_resp || 0) : 0;
      var lu = formatDate(data.meta && data.meta.last_updated);
      var footer = '<div class="delphi-footer">Round 3 \u00b7 n \u2248 ' + nApprox + ' expert responses per actor' +
        (lu ? ' \u00b7 Last updated ' + esc(lu) : '') +
        '</div>';

      mount.innerHTML = style + controls + svg + footer;

      mount.querySelector('#delphi-risk-select').addEventListener('change', function (e) {
        state.riskId = e.target.value;
        doRender();
      });
    }

    doRender();
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
