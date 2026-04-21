/**
 * AIRI Delphi butterfly chart (v1.0.1)
 *
 * v1.0.1 — SVG fills container in both dimensions
 *          (preserveAspectRatio + height 100% + flex-column root)
 *
 * Mounts into an element with id="airi-chart-delphi".
 * Fetches from /data/delphi.json in the same repo.
 *
 * Hosted at:
 *   https://jessgrahamuq.github.io/airi-landing-data/widgets/delphi-chart.js
 *
 * Visual: diverging horizontal bar chart.
 *   Left side: Vulnerability stacked by 5 Likert levels (strongest near center).
 *   Right side: Responsibility stacked by 5 Likert levels (strongest near center).
 *   Dropdowns let user pick risk (24 options) and actor (7 options).
 *   Round 3 (final consensus) only.
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
    var state = { riskId: data.risks[0].number, actor: data.actors[0] };
    var respLevels = data.levels.Responsibility;
    var vulnLevels = data.levels.Vulnerability;

    var style = '<style>' +
      '#airi-chart-delphi { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; display: flex; flex-direction: column; height: 100%; }' +
      '.delphi-controls { display: flex; gap: 12px; margin-bottom: 1rem; flex-wrap: wrap; }' +
      '.delphi-control { flex: 1; min-width: 220px; }' +
      '.delphi-control label { font-size: 11px; color: ' + TEXT_MUTED + '; display: block; margin-bottom: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em; }' +
      '.delphi-control select { width: 100%; padding: 8px 10px; border: 0.5px solid rgba(0,0,0,0.25); border-radius: 6px; font-size: 13px; font-family: inherit; background: #fff; color: ' + TEXT_PRIMARY + '; cursor: pointer; }' +
      '.delphi-control select:hover { border-color: rgba(0,0,0,0.45); }' +
      '.delphi-control select:focus { outline: none; border-color: ' + VULN_COLOR + '; box-shadow: 0 0 0 2px rgba(141,160,203,0.2); }' +
      '.delphi-footer { text-align: center; font-size: 11px; color: ' + TEXT_MUTED + '; margin-top: 10px; }' +
      '</style>';

    function doRender() {
      var actorData = data.data[state.riskId] && data.data[state.riskId][state.actor];
      if (!actorData) {
        mount.innerHTML = style + '<div style="color:' + TEXT_MUTED + ';padding:2rem;text-align:center;">No data for this combination.</div>';
        return;
      }

      var W = 700, H = 320;
      var cx = W / 2;
      var barHeight = 56;
      var topY = 90;
      var scale = (W / 2 - 80) / 100;

      var controls = '<div class="delphi-controls">' +
        '<div class="delphi-control"><label>Risk</label>' +
        '<select id="delphi-risk-select">' +
        data.risks.map(function (r) {
          return '<option value="' + esc(r.number) + '"' + (r.number === state.riskId ? ' selected' : '') + '>' + esc(r.number + ' ' + r.name) + '</option>';
        }).join('') +
        '</select></div>' +
        '<div class="delphi-control"><label>Actor</label>' +
        '<select id="delphi-actor-select">' +
        data.actors.map(function (a) {
          return '<option value="' + esc(a) + '"' + (a === state.actor ? ' selected' : '') + '>' + esc(a) + '</option>';
        }).join('') +
        '</select></div></div>';

      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Delphi butterfly chart of vulnerability and responsibility for selected risk and actor" style="display:block;width:100%;height:100%;font-family:Figtree,sans-serif;">';

      svg += '<text x="' + (cx - 20) + '" y="30" text-anchor="end" font-size="13" font-weight="500" fill="' + VULN_COLOR + '">Vulnerability \u2190</text>';
      svg += '<text x="' + (cx + 20) + '" y="30" text-anchor="start" font-size="13" font-weight="500" fill="' + RESP_COLOR + '">\u2192 Responsibility</text>';

      var ticks = [25, 50, 75, 100];
      ticks.forEach(function (t) {
        var xR = cx + t * scale;
        var xL = cx - t * scale;
        svg += '<line x1="' + xR + '" y1="' + (topY - 10) + '" x2="' + xR + '" y2="' + (topY + barHeight + 18) + '" stroke="' + TEXT_MUTED + '" stroke-width="0.5" stroke-dasharray="2,3" opacity="0.5"/>';
        svg += '<line x1="' + xL + '" y1="' + (topY - 10) + '" x2="' + xL + '" y2="' + (topY + barHeight + 18) + '" stroke="' + TEXT_MUTED + '" stroke-width="0.5" stroke-dasharray="2,3" opacity="0.5"/>';
        svg += '<text x="' + xR + '" y="' + (topY + barHeight + 30) + '" text-anchor="middle" font-size="10" fill="' + TEXT_MUTED + '">' + t + '%</text>';
        svg += '<text x="' + xL + '" y="' + (topY + barHeight + 30) + '" text-anchor="middle" font-size="10" fill="' + TEXT_MUTED + '">' + t + '%</text>';
      });

      // Center line
      svg += '<line x1="' + cx + '" y1="' + (topY - 10) + '" x2="' + cx + '" y2="' + (topY + barHeight + 18) + '" stroke="' + TEXT_PRIMARY + '" stroke-width="1"/>';

      // Responsibility (right) — strongest near center
      var xOffset = cx;
      for (var i = respLevels.length - 1; i >= 0; i--) {
        var level = respLevels[i];
        var val = actorData.Responsibility[level] || 0;
        if (val === 0) continue;
        var w = val * scale;
        var op = opacityFor(i, respLevels.length);
        svg += '<rect x="' + xOffset + '" y="' + topY + '" width="' + w + '" height="' + barHeight + '" fill="' + RESP_COLOR + '" fill-opacity="' + op + '" />';
        if (w > 34) {
          svg += '<text x="' + (xOffset + w / 2) + '" y="' + (topY + barHeight / 2 + 4) + '" text-anchor="middle" font-size="12" font-weight="500" fill="' + (op > 0.6 ? '#fff' : TEXT_PRIMARY) + '">' + val.toFixed(0) + '%</text>';
        }
        xOffset += w;
      }

      // Vulnerability (left) — strongest near center
      xOffset = cx;
      for (var j = vulnLevels.length - 1; j >= 0; j--) {
        var level2 = vulnLevels[j];
        var val2 = actorData.Vulnerability[level2] || 0;
        if (val2 === 0) continue;
        var w2 = val2 * scale;
        var op2 = opacityFor(j, vulnLevels.length);
        svg += '<rect x="' + (xOffset - w2) + '" y="' + topY + '" width="' + w2 + '" height="' + barHeight + '" fill="' + VULN_COLOR + '" fill-opacity="' + op2 + '" />';
        if (w2 > 34) {
          svg += '<text x="' + (xOffset - w2 / 2) + '" y="' + (topY + barHeight / 2 + 4) + '" text-anchor="middle" font-size="12" font-weight="500" fill="' + (op2 > 0.6 ? '#fff' : TEXT_PRIMARY) + '">' + val2.toFixed(0) + '%</text>';
        }
        xOffset -= w2;
      }

      // Legends beneath, strongest first
      var legendY = topY + barHeight + 56;
      var lgLeftWidth = (cx - 40) / vulnLevels.length;
      for (var li = vulnLevels.length - 1; li >= 0; li--) {
        var lvlName = vulnLevels[li];
        var lx = 20 + (vulnLevels.length - 1 - li) * lgLeftWidth;
        svg += '<rect x="' + lx + '" y="' + legendY + '" width="11" height="11" fill="' + VULN_COLOR + '" fill-opacity="' + opacityFor(li, vulnLevels.length) + '" />';
        svg += '<text x="' + (lx + 15) + '" y="' + (legendY + 9) + '" font-size="10" fill="' + TEXT_PRIMARY + '">' + esc(lvlName) + '</text>';
      }
      var lgRightWidth = (cx - 40) / respLevels.length;
      for (var ri = respLevels.length - 1; ri >= 0; ri--) {
        var lvlName2 = respLevels[ri];
        var lx2 = cx + 20 + (respLevels.length - 1 - ri) * lgRightWidth;
        svg += '<rect x="' + lx2 + '" y="' + legendY + '" width="11" height="11" fill="' + RESP_COLOR + '" fill-opacity="' + opacityFor(ri, respLevels.length) + '" />';
        svg += '<text x="' + (lx2 + 15) + '" y="' + (legendY + 9) + '" font-size="10" fill="' + TEXT_PRIMARY + '">' + esc(lvlName2) + '</text>';
      }

      svg += '</svg>';

      var nResp = actorData.n_resp || 0;
      var nVuln = actorData.n_vuln || 0;
      var nDisplay = (nResp === nVuln) ? 'n = ' + nResp : 'n = ' + nResp + ' (resp.), ' + nVuln + ' (vuln.)';
      var lu = formatDate(data.meta && data.meta.last_updated);
      var footer = '<div class="delphi-footer">Round 3 \u00b7 ' + nDisplay + ' expert responses' +
        (lu ? ' \u00b7 Last updated ' + esc(lu) : '') +
        '</div>';

      mount.innerHTML = style + controls + svg + footer;

      mount.querySelector('#delphi-risk-select').addEventListener('change', function (e) {
        state.riskId = e.target.value;
        doRender();
      });
      mount.querySelector('#delphi-actor-select').addEventListener('change', function (e) {
        state.actor = e.target.value;
        doRender();
      });
    }

    doRender();
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
