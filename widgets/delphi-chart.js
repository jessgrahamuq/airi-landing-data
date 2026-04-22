/**
 * AIRI Delphi butterfly chart (v1.3.2)
 *
 * v1.3.2 — Callouts moved outside the chart (matches mitigations-treemap
 *          style): viewBox widened with a 200px gutter on each side. For
 *          the selected risk's callout, draw a small open donut at the
 *          target bar edge, a thin horizontal line out to the gutter,
 *          and text (bold colored title + primary-colored sub) anchored
 *          in the gutter, vertically aligned with the target row.
 * v1.3.1 — Replace pill with in-chart callouts: small white box with
 *          title + sub, a dashed leader line, and an arrowhead pointing
 *          at the target bar segment. Box is drawn in an empty region
 *          of the plot; leader picks the box-edge midpoint closest to
 *          the target. Six risks get callouts; others render unchanged.
 * v1.3.0 — Per-risk callouts: for selected risks, render a small pill
 *          under the risk dropdown with a short framing (e.g. "Shared
 *          responsibility" for Multi-agent risks). Callouts sourced
 *          from Round-3 %s and surface the most striking pattern for
 *          that risk. Risks without a callout render unchanged.
 * v1.2.5 — Very slightly less tall: ROW_H 92 → 86, BAR_H 46 → 42.
 *          Shorter viewBox → more breathing room between the risk
 *          dropdown and the Vulnerability / Responsibility labels.
 * v1.2.4 — Tighter chart-to-caption gaps: drop margin-bottom on
 *          .delphi-controls (6 → 0) and margin-top on .delphi-footer
 *          (4 → 0). Chart now sits directly under the risk dropdown
 *          and directly above the footer.
 * v1.2.3 — Slightly less tall: ROW_H 106 → 92, BAR_H 52 → 46.
 *          Derived H drops from 840 → 742.
 * v1.2.2 — Restore fill behavior: root is height:100% and SVG has
 *          flex:1 so the chart stretches to fill the cell (instead of
 *          rendering at natural aspect, which had made it look small).
 *          Footer still sits tight below.
 * v1.2.1 — Drop forced full-container height (no trailing blank below
 *          the footer). SVG height:100% → auto.
 * v1.2.0 — New diverging Spectral palette (5 distinct colors per side
 *          instead of single hue with varying opacity). Wider viewBox
 *          (W 900 → 1000) so legend items don't crowd. Slightly shorter
 *          (ROW_H 124 → 106, BAR_H 60 → 52). Removed alternating row
 *          background stripes. Actor names bigger (16 → 20) and pushed
 *          further left (SIDE_PAD 30 → 16). Axis titles moved up
 *          (y 22 → 16).
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

  // v1.2.0: diverging Spectral palette. Weakest level → lightest color,
  // strongest level → darkest color. Indexed by level position in data.levels.*.
  // Responsibility Likert: Not at all · Minimally · Moderately · Highly · Primarily
  var RESP_COLORS = ['#fee08b', '#fdae61', '#f46d43', '#d53e4f', '#9e0142'];
  // Vulnerability Likert: Not at all · Minimally · Moderately · Highly · Extremely
  var VULN_COLORS = ['#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'];
  // "Header" hues for the axis titles + select focus ring
  var VULN_LABEL_COLOR = '#3288bd';
  var RESP_LABEL_COLOR = '#d53e4f';
  var TEXT_PRIMARY = '#1A1A1A';
  var TEXT_MUTED = '#898A8D';

  // Use light (white) text on the 2 darkest colors, primary text on the 3 lightest.
  function useLightText(levelIdx) { return levelIdx >= 3; }

  // v1.3.2: per-risk callouts rendered in the outer gutter of the SVG.
  // Each entry specifies:
  //   target: actor + side ('R' or 'V') + level — the bar segment being called out
  // The callout consists of an open donut at the segment's outer edge, a
  // horizontal connector to the gutter, and text anchored in the gutter.
  var CALLOUTS = {
    '7.6': {
      title: 'Shared responsibility',
      sub: '~70% across 3 actors',
      target: { actor: 'AI Developer (General-purpose AI)', side: 'R', level: 'Primarily' }
    },
    '6.5': {
      title: 'Clear ownership',
      sub: '92% → Governance Actor',
      target: { actor: 'AI Governance Actor', side: 'R', level: 'Primarily' }
    },
    '7.1': {
      title: 'Near-unanimous',
      sub: '93% → Developer (GP)',
      target: { actor: 'AI Developer (General-purpose AI)', side: 'R', level: 'Primarily' }
    },
    '6.6': {
      title: 'Infrastructure owns it',
      sub: '84% → Infrastructure Provider',
      target: { actor: 'AI Infrastructure Provider', side: 'R', level: 'Primarily' }
    },
    '3.1': {
      title: 'Users most exposed',
      sub: '88% Extremely vulnerable',
      target: { actor: 'AI User', side: 'V', level: 'Extremely' }
    },
    '4.2': {
      title: 'Developers own it',
      sub: '~80% Dev responsibility',
      target: { actor: 'AI Developer (General-purpose AI)', side: 'R', level: 'Primarily' }
    }
  };

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

  function render(mount, data) {
    var state = { riskId: data.risks[0].number };
    var respLevels = data.levels.Responsibility;
    var vulnLevels = data.levels.Vulnerability;
    var actors = data.actors;

    var style = '<style>' +
      '#airi-chart-delphi { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; display: flex; flex-direction: column; height: 100%; }' +
      '#airi-chart-delphi > svg { flex: 1; min-width: 0; min-height: 0; }' +
      '.delphi-controls { display: flex; gap: 12px; margin-bottom: 0; flex-wrap: wrap; }' +
      '.delphi-control { flex: 1; min-width: 220px; }' +
      '.delphi-control label { font-size: 11px; color: ' + TEXT_MUTED + '; display: block; margin-bottom: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em; }' +
      '.delphi-control select { width: 100%; padding: 8px 10px; border: 0.5px solid rgba(0,0,0,0.25); border-radius: 6px; font-size: 13px; font-family: inherit; background: #fff; color: ' + TEXT_PRIMARY + '; cursor: pointer; }' +
      '.delphi-control select:hover { border-color: rgba(0,0,0,0.45); }' +
      '.delphi-control select:focus { outline: none; border-color: ' + VULN_LABEL_COLOR + '; box-shadow: 0 0 0 2px rgba(50,136,189,0.2); }' +
      '.delphi-footer { text-align: center; font-size: 11px; color: ' + TEXT_MUTED + '; margin-top: 0; }' +
      '</style>';

    function doRender() {
      var riskData = data.data[state.riskId];
      if (!riskData) {
        mount.innerHTML = style + '<div style="color:' + TEXT_MUTED + ';padding:2rem;text-align:center;">No data for this risk.</div>';
        return;
      }

      // ---------- Layout --------------------------------------------------
      // v1.2.0: wider (more room for legend), slightly shorter, tighter side pad.
      var W = 1000;
      var ROW_H = 86;            // v1.2.5: very slightly less tall (was 92)
      var BAR_H = 42;            // v1.2.5: very slightly less tall (was 46)
      var TOP_AREA = 50;         // axis titles + tick labels
      var LEGEND_H = 48;         // legend band at bottom
      var SIDE_PAD = 16;         // v1.2.0: actor name pushed further left, bars wider
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

      // v1.3.2: outer gutters on left + right hold callout text. Plot
      // coordinates (cx=500, bars, legend, axis titles) are unchanged —
      // the viewBox simply extends into negative-x on the left and past
      // W on the right.
      var GUTTER = 200;
      var vbX = -GUTTER;
      var vbW = W + 2 * GUTTER;
      var svg = '<svg viewBox="' + vbX + ' 0 ' + vbW + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Delphi butterfly chart of vulnerability and responsibility per actor for selected risk" style="display:block;width:100%;height:100%;font-family:Figtree,sans-serif;">';

      // v1.2.0: no alternating row stripes — larger actor labels provide segmentation.

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
      // v1.2.0: pulled up to y=16 (was 22)
      svg += '<text x="' + (cx - 24) + '" y="16" text-anchor="end" font-size="22" font-weight="700" fill="' + VULN_LABEL_COLOR + '">Vulnerability \u2190</text>';
      svg += '<text x="' + (cx + 24) + '" y="16" text-anchor="start" font-size="22" font-weight="700" fill="' + RESP_LABEL_COLOR + '">\u2192 Responsibility</text>';

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

        // Actor name (left-aligned inside its row) — v1.2.0: bigger, pushed left
        svg += '<text x="' + SIDE_PAD + '" y="' + (yBase + 22) + '" text-anchor="start" font-size="20" font-weight="700" fill="' + TEXT_PRIMARY + '">' + esc(actor) + '</text>';

        var barY = yBase + 36;

        // Responsibility (right) — strongest near center. v1.2.0: per-level colors.
        var xOffR = cx;
        for (var i = respLevels.length - 1; i >= 0; i--) {
          var levelR = respLevels[i];
          var valR = actorData.Responsibility[levelR] || 0;
          if (valR === 0) continue;
          var wR = valR * scale;
          var fillR = RESP_COLORS[i] || '#ccc';
          svg += '<rect x="' + xOffR + '" y="' + barY + '" width="' + wR + '" height="' + BAR_H + '" fill="' + fillR + '"/>';
          if (wR > 32) {
            svg += '<text x="' + (xOffR + wR / 2) + '" y="' + (barY + BAR_H / 2 + 5) + '" text-anchor="middle" font-size="14" font-weight="600" fill="' + (useLightText(i) ? '#fff' : TEXT_PRIMARY) + '">' + valR.toFixed(0) + '%</text>';
          }
          xOffR += wR;
        }

        // Vulnerability (left) — strongest near center. v1.2.0: per-level colors.
        var xOffL = cx;
        for (var j = vulnLevels.length - 1; j >= 0; j--) {
          var levelV = vulnLevels[j];
          var valV = actorData.Vulnerability[levelV] || 0;
          if (valV === 0) continue;
          var wV = valV * scale;
          var fillV = VULN_COLORS[j] || '#ccc';
          svg += '<rect x="' + (xOffL - wV) + '" y="' + barY + '" width="' + wV + '" height="' + BAR_H + '" fill="' + fillV + '"/>';
          if (wV > 32) {
            svg += '<text x="' + (xOffL - wV / 2) + '" y="' + (barY + BAR_H / 2 + 5) + '" text-anchor="middle" font-size="14" font-weight="600" fill="' + (useLightText(j) ? '#fff' : TEXT_PRIMARY) + '">' + valV.toFixed(0) + '%</text>';
          }
          xOffL -= wV;
        }
      });

      // ---------- Per-risk callout (v1.3.2, outer gutter) --------------
      var cb = CALLOUTS[state.riskId];
      if (cb) {
        var tai = actors.indexOf(cb.target.actor);
        var tad = riskData[cb.target.actor];
        var tLevels = cb.target.side === 'R' ? respLevels : vulnLevels;
        var tField = cb.target.side === 'R' ? 'Responsibility' : 'Vulnerability';
        var tLevelIdx = tLevels.indexOf(cb.target.level);
        if (tai >= 0 && tad && tLevelIdx >= 0) {
          // Outer edge of the target level's segment = sum of all segments
          // from innermost (last index) down to and including the target level.
          var acc = 0;
          for (var tk = tLevels.length - 1; tk >= tLevelIdx; tk--) {
            acc += (tad[tField][tLevels[tk]] || 0) * scale;
          }
          var tx = cb.target.side === 'R' ? (cx + acc) : (cx - acc);
          var ty = TOP_AREA + tai * ROW_H + 36 + BAR_H / 2;

          var coColor = cb.target.side === 'R' ? RESP_LABEL_COLOR : VULN_LABEL_COLOR;
          var dotR = 6;

          // Line extends from just outside the donut into the outer gutter.
          var lineStartX, lineEndX, textX, textAnchor;
          if (cb.target.side === 'R') {
            lineStartX = tx + dotR + 2;
            lineEndX = W + 12;           // just past the plot edge
            textX = W + 20;              // 8px past lineEndX
            textAnchor = 'start';
          } else {
            lineStartX = tx - dotR - 2;
            lineEndX = -12;
            textX = -20;
            textAnchor = 'end';
          }

          // Open donut at the target bar edge
          svg += '<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) +
                 '" r="' + dotR + '" fill="#ffffff" stroke="' + coColor + '" stroke-width="2"/>';

          // Thin horizontal connector out to the gutter
          svg += '<line x1="' + lineStartX.toFixed(1) + '" y1="' + ty.toFixed(1) +
                 '" x2="' + lineEndX + '" y2="' + ty.toFixed(1) +
                 '" stroke="' + coColor + '" stroke-width="1"/>';

          // Title (colored bold) + sub (primary text)
          svg += '<text x="' + textX + '" y="' + (ty - 4).toFixed(1) +
                 '" text-anchor="' + textAnchor + '" font-size="15" font-weight="700" fill="' + coColor + '">' +
                 esc(cb.title) + '</text>';
          svg += '<text x="' + textX + '" y="' + (ty + 14).toFixed(1) +
                 '" text-anchor="' + textAnchor + '" font-size="13" fill="' + TEXT_PRIMARY + '">' +
                 esc(cb.sub) + '</text>';
        }
      }

      // ---------- Legend at the bottom ---------------------------------
      // v1.2.0: per-level colors from the Spectral palette.
      var legendY = gridBottom + 20;
      var lgLeftWidth = (cx - 40) / vulnLevels.length;
      for (var li = vulnLevels.length - 1; li >= 0; li--) {
        var lvlName = vulnLevels[li];
        var lx = 20 + (vulnLevels.length - 1 - li) * lgLeftWidth;
        svg += '<rect x="' + lx + '" y="' + legendY + '" width="14" height="14" fill="' + (VULN_COLORS[li] || '#ccc') + '"/>';
        svg += '<text x="' + (lx + 19) + '" y="' + (legendY + 12) + '" font-size="13" fill="' + TEXT_PRIMARY + '">' + esc(lvlName) + '</text>';
      }
      var lgRightWidth = (cx - 40) / respLevels.length;
      for (var ri = respLevels.length - 1; ri >= 0; ri--) {
        var lvlName2 = respLevels[ri];
        var lx2 = cx + 20 + (respLevels.length - 1 - ri) * lgRightWidth;
        svg += '<rect x="' + lx2 + '" y="' + legendY + '" width="14" height="14" fill="' + (RESP_COLORS[ri] || '#ccc') + '"/>';
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
