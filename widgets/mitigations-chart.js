/**
 * AIRI Mitigations drill-down donut chart (v1.0.6)
 *
 * Mounts into an element with id="airi-chart-mitigations".
 * Fetches from /data/mitigations.json in the same repo.
 *
 * Hosted at:
 *   https://jessgrahamuq.github.io/airi-landing-data/widgets/mitigations-chart.js
 *
 * v1.0.6 — Shrink viewBox height back to 540 (was 750). The extra 210
 *          viewBox units after v1.0.4 sat empty below the donut labels
 *          and, with preserveAspectRatio=xMidYMax meet, rendered as a
 *          visible gap between the donut and the hint/footer captions.
 * v1.0.5 — Tighter top margin for closer alignment with text panel
 *          (donut cy 385 → 280; donut top now ~100 instead of ~205)
 * v1.0.4 — Taller viewBox (820 × 750) for better vertical fill
 * v1.0.3 — Tighten caption spacing: donut hugs bottom of SVG
 *          (preserveAspectRatio=xMidYMax) and hint/footer margins shrink.
 * v1.0.2 — SVG fills container in both dimensions
 *          (preserveAspectRatio + height 100% + flex-column root)
 * v1.0.1 — bigger donut, tighter labels, more square viewBox
 *          (was 1000x520 r150/88, now 820x540 r180/105)
 */
(function () {
  var DATA_URL = 'https://jessgrahamuq.github.io/airi-landing-data/data/mitigations.json';

  var BASE_COLORS = {
    default: ['#8DA0CB', '#66C2A5', '#E5C494', '#C9CED6', '#FC8D62', '#A6D854', '#E78AC3']
  };

  var TEXT_PRIMARY = '#1A1A1A';
  var TEXT_MUTED = '#898A8D';

  function run() {
    var mount = document.getElementById('airi-chart-mitigations');
    if (!mount) return;
    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { render(mount, data); })
      .catch(function (err) {
        console.error('[airi-mitigations-chart]', err);
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

  function colorForTop(index) {
    return BASE_COLORS.default[index % BASE_COLORS.default.length];
  }

  function childColor(parentColor, index, total) {
    var op = 1 - (index / Math.max(total - 1, 1)) * 0.45;
    return { fill: parentColor, opacity: op };
  }

  function polar(cx, cy, r, angle) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
    var sO = polar(cx, cy, rOuter, endAngle);
    var eO = polar(cx, cy, rOuter, startAngle);
    var sI = polar(cx, cy, rInner, startAngle);
    var eI = polar(cx, cy, rInner, endAngle);
    var la = (endAngle - startAngle) > Math.PI ? 1 : 0;
    return ['M', sO.x, sO.y,
      'A', rOuter, rOuter, 0, la, 0, eO.x, eO.y,
      'L', sI.x, sI.y,
      'A', rInner, rInner, 0, la, 1, eI.x, eI.y, 'Z'].join(' ');
  }

  function deoverlap(labels, minGap) {
    var leftSide = labels.filter(function (l) { return !l.isRight; })
                         .sort(function (a, b) { return a.preferredY - b.preferredY; });
    var rightSide = labels.filter(function (l) { return l.isRight; })
                          .sort(function (a, b) { return a.preferredY - b.preferredY; });
    [leftSide, rightSide].forEach(function (side) {
      for (var i = 1; i < side.length; i++) {
        var gap = side[i].preferredY - side[i - 1].preferredY;
        if (gap < minGap) side[i].preferredY = side[i - 1].preferredY + minGap;
      }
      for (var j = side.length - 2; j >= 0; j--) {
        var gap2 = side[j + 1].preferredY - side[j].preferredY;
        if (gap2 < minGap) side[j].preferredY = side[j + 1].preferredY - minGap;
      }
    });
  }

  function render(mount, data) {
    var topCats = (data.taxonomy && data.taxonomy.top_categories) || [];
    var childrenMap = (data.taxonomy && data.taxonomy.children_by_parent) || {};
    var mitsMap = data.mitigations_by_category || {};

    var topColorMap = {};
    topCats.forEach(function (c, i) { topColorMap[c.id] = colorForTop(i); });

    var state = { level: 0, parentId: null };

    // Tuned for better fit in Webflow slide container
    var W = 820, H = 540; // v1.0.6: shrink H back (was 750) to close the gap to the caption
    var cx = W / 2, cy = 280; // equals H/2 + 10 at H=540; donut labels end ~y=500, leaves ~40px bottom margin
    var outer = 180, inner = 105;

    var style = '<style>' +
      '#airi-chart-mitigations { position: relative; color: ' + TEXT_PRIMARY + '; font-family: Figtree, sans-serif; display: flex; flex-direction: column; height: 100%; }' +
      '.mit-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 13px; min-height: 28px; }' +
      '.mit-back { background: none; border: none; padding: 0; cursor: pointer; color: ' + TEXT_MUTED + '; font-size: 13px; font-family: inherit; }' +
      '.mit-back:hover { color: ' + TEXT_PRIMARY + '; }' +
      '.mit-slice { cursor: pointer; transition: fill-opacity 0.15s ease; }' +
      '.mit-hint { text-align: center; font-size: 11px; color: ' + TEXT_MUTED + '; margin-top: 2px; }' +
      '.mit-footer { text-align: center; font-size: 11px; color: ' + TEXT_MUTED + '; margin-top: 4px; }' +
      '.mit-modal { position: absolute; inset: 0; background: rgba(255,255,255,0.98); border-radius: inherit; padding: 1.5rem 1.75rem 1.25rem; opacity: 0; pointer-events: none; transition: opacity 0.18s ease; z-index: 20; overflow-y: auto; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }' +
      '.mit-modal.is-visible { opacity: 1; pointer-events: auto; }' +
      '.mit-modal-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }' +
      '.mit-modal-title { font-size: 1.05rem; font-weight: 600; color: ' + TEXT_PRIMARY + '; margin: 0; line-height: 1.3; }' +
      '.mit-modal-sub { font-size: 0.8rem; color: ' + TEXT_MUTED + '; margin-top: 0.15rem; }' +
      '.mit-modal-close { background: none; border: none; font-size: 1.4rem; line-height: 1; color: ' + TEXT_MUTED + '; cursor: pointer; padding: 0 0.25rem; flex-shrink: 0; }' +
      '.mit-modal-close:hover { color: ' + TEXT_PRIMARY + '; }' +
      '.mit-modal-list { list-style: none; margin: 0; padding: 0; }' +
      '.mit-modal-item { display: block; padding: 0.6rem 0; border-top: 1px solid rgba(0,0,0,0.08); }' +
      '.mit-modal-item:first-child { border-top: none; }' +
      '.mit-modal-link { text-decoration: none; color: ' + TEXT_PRIMARY + '; display: block; }' +
      '.mit-modal-link:hover .mit-modal-item-title { text-decoration: underline; }' +
      '.mit-modal-item-title { font-size: 0.9rem; font-weight: 500; line-height: 1.4; }' +
      '.mit-modal-item-meta { font-size: 0.75rem; color: ' + TEXT_MUTED + '; margin-top: 0.25rem; }' +
      '.mit-modal-empty { color: ' + TEXT_MUTED + '; font-size: 0.9rem; padding: 1rem 0; }' +
      '.mit-modal-footer { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.08); font-size: 0.8rem; }' +
      '.mit-modal-footer a { color: #8DA0CB; font-weight: 600; text-decoration: none; }' +
      '.mit-modal-footer a:hover { text-decoration: underline; }' +
      '</style>';

    function doRender() {
      var slices, totalValue, totalLabel, centerLine2, isDrilled = state.level === 1;
      if (!isDrilled) {
        slices = topCats;
        totalValue = slices.reduce(function (a, s) { return a + (s.count || 0); }, 0);
        totalLabel = 'Total actions';
        centerLine2 = slices.length + ' categor' + (slices.length === 1 ? 'y' : 'ies');
      } else {
        var parent = topCats.find(function (c) { return c.id === state.parentId; });
        slices = (childrenMap[state.parentId] || []).filter(function (s) { return (s.count || 0) > 0; });
        totalValue = parent ? parent.count : 0;
        totalLabel = parent ? parent.name : '';
        centerLine2 = slices.length + ' subcategor' + (slices.length === 1 ? 'y' : 'ies');
      }

      var sliceTotal = slices.reduce(function (a, s) { return a + (s.count || 0); }, 0);

      if (!slices.length) {
        slices = [{ id: 'empty', name: 'No subcategories', count: 1 }];
        sliceTotal = 1;
      }

      var parentObj = topCats.find(function (c) { return c.id === state.parentId; });
      var breadcrumb = !isDrilled
        ? '<div class="mit-breadcrumb" style="color:' + TEXT_MUTED + ';">All categories</div>'
        : '<div class="mit-breadcrumb"><button class="mit-back">\u2190 All categories</button><span style="color:' + TEXT_MUTED + ';">/</span><span style="color:' + TEXT_PRIMARY + ';font-weight:500;">' + esc(parentObj ? parentObj.name : '') + '</span></div>';

      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Mitigation categories donut chart" style="display:block;width:100%;height:100%;font-family:Figtree,sans-serif;">';

      var startAngle = -Math.PI / 2;
      var sliceData = [];
      slices.forEach(function (slice, idx) {
        var angleSpan = (slice.count / sliceTotal) * Math.PI * 2;
        var endAngle = startAngle + angleSpan;
        var midAngle = (startAngle + endAngle) / 2;
        var pAnchor = polar(cx, cy, outer + 2, midAngle);
        var pMid = polar(cx, cy, outer + 20, midAngle);
        var isRight = Math.cos(midAngle) >= 0;
        sliceData.push({
          slice: slice, idx: idx,
          startAngle: startAngle, endAngle: endAngle, midAngle: midAngle,
          isRight: isRight,
          anchorX: pAnchor.x, anchorY: pAnchor.y,
          midX: pMid.x, midY: pMid.y,
          preferredY: pMid.y
        });
        startAngle = endAngle;
      });

      deoverlap(sliceData, 34);

      var paths = '';
      var labels = '';
      sliceData.forEach(function (d) {
        var fill, opacity;
        if (!isDrilled) {
          fill = topColorMap[d.slice.id] || '#ccc';
          opacity = 1;
        } else {
          var parentColor = topColorMap[state.parentId] || '#8DA0CB';
          var col = childColor(parentColor, d.idx, slices.length);
          fill = col.fill;
          opacity = col.opacity;
        }
        var path = arcPath(cx, cy, outer, inner, d.startAngle, d.endAngle);
        var clickable = d.slice.id !== 'empty';
        paths += '<path class="mit-slice" data-id="' + esc(d.slice.id) + '" d="' + path + '" fill="' + fill + '" fill-opacity="' + opacity + '" style="cursor:' + (clickable ? 'pointer' : 'default') + ';" />';

        if (d.slice.id === 'empty') return;

        var elbowY = d.preferredY;
        var tailX = d.midX + (d.isRight ? 10 : -10);
        labels += '<polyline points="' + d.anchorX.toFixed(1) + ',' + d.anchorY.toFixed(1) + ' ' + d.midX.toFixed(1) + ',' + elbowY.toFixed(1) + ' ' + tailX.toFixed(1) + ',' + elbowY.toFixed(1) + '" fill="none" stroke="' + TEXT_MUTED + '" stroke-width="0.5" />';

        var labelX = tailX + (d.isRight ? 6 : -6);
        var anchor = d.isRight ? 'start' : 'end';
        labels += '<text x="' + labelX + '" y="' + (elbowY - 3).toFixed(1) + '" text-anchor="' + anchor + '" font-size="14" font-weight="500" fill="' + TEXT_PRIMARY + '" style="pointer-events:none;">' + esc(d.slice.name) + '</text>';
        labels += '<text x="' + labelX + '" y="' + (elbowY + 13).toFixed(1) + '" text-anchor="' + anchor + '" font-size="11" fill="' + TEXT_MUTED + '" style="pointer-events:none;">' + (d.slice.count || 0).toLocaleString() + ' actions</text>';
      });

      svg += paths + labels;

      svg += '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-size="32" font-weight="500" fill="' + TEXT_PRIMARY + '">' + totalValue.toLocaleString() + '</text>';
      svg += '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="12" fill="' + TEXT_MUTED + '">' + esc(totalLabel) + '</text>';
      svg += '<text x="' + cx + '" y="' + (cy + 30) + '" text-anchor="middle" font-size="11" fill="' + TEXT_MUTED + '" fill-opacity="0.7">' + esc(centerLine2) + '</text>';

      svg += '</svg>';

      var hint = !isDrilled
        ? '<div class="mit-hint">Click a slice to see subcategories</div>'
        : '<div class="mit-hint">Click a subcategory to see mitigation actions</div>';

      var lu = formatDate(data.meta && data.meta.last_updated);
      var footer = '<div class="mit-footer">' +
        (lu ? 'Last updated ' + esc(lu) : '') +
        (data.meta && data.meta.record_count ? ' \u00b7 ' + data.meta.record_count.toLocaleString() + ' mitigation actions' : '') +
        (data.meta && data.meta.document_count ? ' \u00b7 ' + data.meta.document_count + ' sources' : '') +
        '</div>';

      var modal = '<div class="mit-modal" role="dialog" aria-modal="true" aria-hidden="true"></div>';

      mount.innerHTML = style + breadcrumb + svg + hint + footer + modal;

      var modalEl = mount.querySelector('.mit-modal');
      var sliceEls = mount.querySelectorAll('.mit-slice');

      function baseOpacity(idx) {
        if (!isDrilled) return 1;
        var parentColor = topColorMap[state.parentId] || '#8DA0CB';
        return childColor(parentColor, idx, slices.length).opacity;
      }

      sliceEls.forEach(function (el, idx) {
        var id = el.getAttribute('data-id');
        if (id === 'empty') return;

        el.addEventListener('mouseenter', function () {
          sliceEls.forEach(function (s, i) {
            s.style.fillOpacity = s === el ? '1' : (baseOpacity(i) * 0.35);
          });
        });
        el.addEventListener('mouseleave', function () {
          sliceEls.forEach(function (s, i) { s.style.fillOpacity = baseOpacity(i); });
        });
        el.addEventListener('click', function () {
          if (!isDrilled) {
            state.level = 1;
            state.parentId = id;
            doRender();
          } else {
            var sub = slices.find(function (s) { return s.id === id; });
            if (sub) openModal(sub);
          }
        });
      });

      var back = mount.querySelector('.mit-back');
      if (back) back.addEventListener('click', function () {
        state.level = 0;
        state.parentId = null;
        doRender();
      });

      function openModal(sub) {
        var items = mitsMap[sub.id] || [];
        var cta = (data.meta && data.meta.cta_url) || 'https://airisk.mit.edu/ai-risk-mitigations';
        var ctaLabel = (data.meta && data.meta.cta_label) || 'Explore the database \u2192';

        var list;
        if (!items.length) {
          list = '<div class="mit-modal-empty">No mitigation documents with source links available for this subcategory yet.</div>';
        } else {
          list = '<ul class="mit-modal-list">' + items.map(function (it) {
            var metaBits = [];
            if (it.source_ref) metaBits.push('<span>' + esc(it.source_ref) + '</span>');
            if (it.source_title) metaBits.push('<span style="color:' + TEXT_MUTED + ';">' + esc(it.source_title) + '</span>');
            return '<li class="mit-modal-item"><a class="mit-modal-link" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer"><div class="mit-modal-item-title">' + esc(it.name) + '</div><div class="mit-modal-item-meta">' + metaBits.join(' \u00b7 ') + '</div></a></li>';
          }).join('') + '</ul>';
        }

        modalEl.innerHTML =
          '<div class="mit-modal-header">' +
            '<div>' +
              '<h3 class="mit-modal-title">' + esc(sub.name) + '</h3>' +
              '<div class="mit-modal-sub">' + (sub.count || 0) + ' mitigation actions catalogued</div>' +
            '</div>' +
            '<button class="mit-modal-close" aria-label="Close">\u2715</button>' +
          '</div>' +
          list +
          '<div class="mit-modal-footer"><a href="' + esc(cta) + '" target="_blank" rel="noopener noreferrer">' + esc(ctaLabel) + '</a></div>';

        modalEl.classList.add('is-visible');
        modalEl.setAttribute('aria-hidden', 'false');

        modalEl.querySelector('.mit-modal-close').addEventListener('click', closeModal);
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
    }

    doRender();
  }

  if (document.readyState !== 'loading') run();
  else document.addEventListener('DOMContentLoaded', run);
})();
