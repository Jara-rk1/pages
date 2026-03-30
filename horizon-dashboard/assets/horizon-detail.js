/**
 * HORIZON BD Opportunity Engine — Detail Page & Briefing Modal
 * horizon-detail.js
 *
 * Depends on: horizon-pipeline.js (APP, api, apiPost, escapeHtml, getTier, TIER_COLORS, formatSector)
 * Charts: ECharts with 'kpmg' theme (registered in pipeline)
 */

/* ============================================================
   1. HELPER FUNCTIONS
   ============================================================ */

function tierColor(score) {
  if (score >= 80) return '#7213EA';
  if (score >= 60) return '#1E49E2';
  if (score >= 40) return '#00B8F5';
  return '#666666';
}

function tierLabel(score) {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Warm';
  if (score >= 40) return 'Watch';
  return 'Cold';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var day = d.getDate();
  var mon = months[d.getMonth()];
  var yr = d.getFullYear();
  return day + ' ' + mon + ' ' + yr;
}

function formatCurrency(val) {
  if (!val && val !== 0) return '$0k';
  if (val >= 1000) {
    return '$' + (val / 1000).toFixed(1) + 'm';
  }
  return '$' + Math.round(val) + 'k';
}

function dimDisplayName(dim) {
  if (!dim) return '';
  return dim.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

/* ============================================================
   2. LOAD DETAIL
   ============================================================ */

async function loadDetail(id) {
  try {
    var data = await api('/api/opportunities/' + id);
    APP.currentOpp = data;
    renderDetail(data);
  } catch (e) {
    var el = document.getElementById('detail-content');
    if (el) el.innerHTML = '<div class="error-state">Failed to load opportunity details.</div>';
    console.error('loadDetail error:', e);
  }
}

/* ============================================================
   3. RENDER DETAIL
   ============================================================ */

function renderDetail(opp) {
  var el = document.getElementById('detail-content');
  if (!el) return;

  var score = opp.composite_score || 0;
  var tier = tierLabel(score);
  var tierCls = tier.toLowerCase();
  var color = tierColor(score);
  var sensitivity = (opp.sensitivity || 'standard').toLowerCase();

  // Estimated value calculation
  var estMin = 0;
  var estMax = 0;
  var offerings = opp.offerings || [];
  for (var i = 0; i < offerings.length; i++) {
    var off = offerings[i];
    var conf = off.confidence || 0;
    estMin += (off.typical_size_min || 0) * conf;
    estMax += (off.typical_size_max || 0) * conf;
  }

  // Status list
  var statuses = ['detected','qualified','pitched','won','lost','archived'];
  var currentStatus = (opp.status || 'detected').toLowerCase();

  // Score dimensions
  var dims = [
    'data_strength','signal_recency','political_alignment','budget_availability',
    'capability_fit','competitive_landscape','timing','strategic_value',
    'engagement_size','signal_convergence'
  ];
  var manualDims = ['political_alignment','budget_availability','timing','competitive_landscape'];
  var kpmgPalette = ['#00338D','#00B8F5','#1E49E2','#76D2FF','#7213EA','#B497FF','#00C0AE','#AB0D82'];
  var scores = opp.scores || {};
  var signals = opp.signals || [];
  var gaps = opp.gaps || [];

  // ---- Build HTML ----

  var html = '';

  // --- Banner ---
  html += '<div class="detail-banner">';
  html += '  <div class="detail-banner__left">';
  html += '    <h2 class="detail-banner__title">' + escapeHtml(opp.title || '') + '</h2>';
  html += '    <div class="detail-banner__badges">';
  html += '      <span class="badge badge--sector">' + escapeHtml(formatSector(opp.sector || '')) + '</span>';
  html += '      <span class="badge badge--jurisdiction">' + escapeHtml(opp.jurisdiction || '') + '</span>';
  html += '      <span class="badge badge--' + tierCls + '">' + escapeHtml(tier) + '</span>';
  html += '      <span class="sensitivity-badge sensitivity-badge--' + escapeHtml(sensitivity) + '">' + escapeHtml((opp.sensitivity || 'Standard')) + '</span>';
  html += '      <span class="badge badge--status">' + escapeHtml(opp.status || '') + '</span>';
  html += '    </div>';
  html += '  </div>';
  html += '  <div class="detail-banner__right">';
  html += '    <div class="detail-score-display">';
  html += '      <span class="detail-score-value" style="color:' + color + '">' + score.toFixed(1) + '</span>';
  html += '      <span class="detail-score-label">HORIZON Score</span>';
  html += '    </div>';
  html += '    <div class="detail-est-value">';
  html += '      <span class="detail-est-value__amount">' + formatCurrency(estMin) + '–' + formatCurrency(estMax) + '</span>';
  html += '      <span class="detail-est-value__label">Est. Value</span>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';

  // --- Status Row ---
  html += '<div class="detail-status-row">';
  for (var si = 0; si < statuses.length; si++) {
    var st = statuses[si];
    var isActive = st === currentStatus ? ' status-btn--active' : '';
    html += '<button class="status-btn' + isActive + '" data-status="' + escapeHtml(st) + '" data-opp-id="' + escapeHtml(String(opp.id)) + '">';
    html += escapeHtml(st.charAt(0).toUpperCase() + st.slice(1));
    html += '</button>';
  }
  html += '</div>';

  // --- Detail Grid ---
  html += '<div class="detail-grid">';

  // LEFT COLUMN
  html += '<div class="detail-grid__left">';

  // Scoring Section
  html += '<div class="detail-section">';
  html += '  <div class="detail-section__header"><span class="detail-section__title">Scoring Breakdown</span></div>';
  html += '  <div class="detail-section__body">';
  html += '    <div class="detail-radar" id="detail-radar-chart" style="width:100%;height:280px;"></div>';

  // Score bars grid
  html += '    <div class="score-grid">';
  for (var di = 0; di < dims.length; di++) {
    var dim = dims[di];
    var dimVal = scores[dim] || 0;
    var barColor = kpmgPalette[di % kpmgPalette.length];
    var barWidth = Math.min(100, (dimVal / 10) * 100).toFixed(1);
    html += '    <div class="score-grid-item">';
    html += '      <span class="score-grid-item__label">' + escapeHtml(dimDisplayName(dim)) + '</span>';
    html += '      <div class="score-grid-item__bar">';
    html += '        <div class="score-grid-item__fill" style="width:' + barWidth + '%;background:' + barColor + '"></div>';
    html += '      </div>';
    html += '      <span class="score-grid-item__val">' + (dimVal % 1 === 0 ? dimVal : dimVal.toFixed(1)) + '</span>';
    html += '    </div>';
  }
  html += '    </div>';

  // Manual sliders
  html += '    <div class="score-sliders">';
  for (var mi = 0; mi < manualDims.length; mi++) {
    var mdim = manualDims[mi];
    var mval = scores[mdim] || 0;
    html += '    <div class="slider-group">';
    html += '      <label for="slider-' + escapeHtml(mdim) + '">' + escapeHtml(dimDisplayName(mdim)) + '</label>';
    html += '      <div class="slider-row">';
    html += '        <input type="range" id="slider-' + escapeHtml(mdim) + '" class="score-slider"';
    html += '          data-dim="' + escapeHtml(mdim) + '" min="0" max="10" step="0.5"';
    html += '          value="' + escapeHtml(String(mval)) + '">';
    html += '        <span class="slider-val" id="slider-val-' + escapeHtml(mdim) + '">' + (mval % 1 === 0 ? mval : mval.toFixed(1)) + '</span>';
    html += '      </div>';
    html += '    </div>';
  }
  html += '      <button class="btn btn--primary btn--sm" id="save-scores-btn" data-opp-id="' + escapeHtml(String(opp.id)) + '">Save Scores</button>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';

  // Signals Section
  html += '<div class="detail-section">';
  html += '  <div class="detail-section__header">';
  html += '    <span class="detail-section__title">Signals</span>';
  html += '    <span class="panel-header__meta">' + signals.length + '</span>';
  html += '  </div>';
  html += '  <div class="detail-section__body">';
  html += '    <ul class="signal-list">';
  for (var sigi = 0; sigi < signals.length; sigi++) {
    var sig = signals[sigi];
    var titleHtml = sig.url
      ? '<a href="' + escapeHtml(sig.url) + '" target="_blank" rel="noopener">' + escapeHtml(sig.title || '') + '</a>'
      : escapeHtml(sig.title || '');
    html += '    <li class="signal-item">';
    html += '      <span class="signal-item__type">' + escapeHtml(sig.signal_type || '') + '</span>';
    html += '      ' + titleHtml;
    html += '      <span class="signal-item__date">' + escapeHtml(formatDate(sig.date || sig.detected_at || '')) + '</span>';
    html += '    </li>';
  }
  html += '    </ul>';
  html += '  </div>';
  html += '</div>';

  html += '</div>'; // end detail-grid__left

  // RIGHT COLUMN
  html += '<div class="detail-grid__right">';

  // Offerings Section
  html += '<div class="detail-section">';
  html += '  <div class="detail-section__header"><span class="detail-section__title">Matched Offerings</span></div>';
  html += '  <div class="detail-section__body">';
  for (var oi = 0; oi < offerings.length; oi++) {
    var off2 = offerings[oi];
    var confPct = Math.round((off2.confidence || 0) * 100);
    html += '  <div class="offering-item">';
    html += '    <div class="offering-item__name">' + escapeHtml(off2.name || '') + '</div>';
    html += '    <div class="offering-item__method">' + escapeHtml(off2.methodology || '') + '</div>';
    html += '    <div class="offering-item__desc">' + escapeHtml(off2.description || '') + '</div>';
    html += '    <div class="offering-item__size">' + formatCurrency(off2.typical_size_min) + '–' + formatCurrency(off2.typical_size_max) + ' typical</div>';
    if (off2.skill_command) {
      html += '    <div class="offering-item__cmd"><code>' + escapeHtml(off2.skill_command) + '</code></div>';
    }
    html += '    <div class="confidence-bar">';
    html += '      <div class="confidence-bar__fill" style="width:' + confPct + '%"></div>';
    html += '    </div>';
    html += '  </div>';
  }
  if (offerings.length === 0) {
    html += '<p class="empty-state">No offerings matched.</p>';
  }
  html += '  </div>';
  html += '</div>';

  // Gaps Section
  html += '<div class="detail-section">';
  html += '  <div class="detail-section__header"><span class="detail-section__title">Jurisdiction Gaps</span></div>';
  html += '  <div class="detail-section__body">';
  html += '    <div class="gaps-chart" id="detail-gaps-chart" style="width:100%;height:240px;"></div>';
  if (gaps.length > 0) {
    var mixedJuris = gaps.some(function(g) { return g.jurisdiction_a !== gaps[0].jurisdiction_a; });
    var colA = mixedJuris ? 'Jurisdiction' : escapeHtml(gaps[0].jurisdiction_a || 'A');
    var colB = escapeHtml(gaps[0].jurisdiction_b || 'National');
    html += '    <table class="data-table">';
    html += '      <thead><tr><th>Metric</th><th>' + colA + '</th><th>' + colB + '</th><th>Gap</th></tr></thead>';
    html += '      <tbody>';
    for (var gi = 0; gi < gaps.length; gi++) {
      var gap = gaps[gi];
      var gapPctVal = gap.gap_pct || 0;
      var gapColor = gapPctVal >= 0 ? '#00C0AE' : '#AB0D82';
      var cellA = mixedJuris
        ? escapeHtml(gap.jurisdiction_a || '') + ' ' + escapeHtml(String(gap.value_a || ''))
        : escapeHtml(String(gap.value_a || ''));
      html += '      <tr>';
      html += '        <td>' + escapeHtml(formatMetricName(gap.metric)) + '</td>';
      html += '        <td>' + cellA + '</td>';
      html += '        <td>' + escapeHtml(String(gap.value_b || '')) + '</td>';
      html += '        <td style="color:' + gapColor + ';font-weight:bold">' + (gapPctVal >= 0 ? '+' : '') + gapPctVal.toFixed(1) + '%</td>';
      html += '      </tr>';
    }
    html += '      </tbody>';
    html += '    </table>';
  }
  html += '  </div>';
  html += '</div>';

  // Description Section
  html += '<div class="detail-section">';
  html += '  <div class="detail-section__header"><span class="detail-section__title">Description</span></div>';
  html += '  <div class="detail-section__body">';
  html += '    <p class="description-text">' + escapeHtml(opp.description || '') + '</p>';
  html += '    <div class="btn-row">';
  html += '      <button class="btn btn--primary" id="view-full-brief-btn" data-opp-id="' + escapeHtml(String(opp.id)) + '">View Full Brief</button>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';

  html += '</div>'; // end detail-grid__right
  html += '</div>'; // end detail-grid

  el.innerHTML = html;

  // Init charts
  renderDetailRadar(scores);
  renderDetailGaps(gaps);

  // Attach event listeners
  _attachDetailListeners(opp);
}

function _attachDetailListeners(opp) {
  // Status buttons
  var statusBtns = document.querySelectorAll('.status-btn');
  for (var i = 0; i < statusBtns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var newStatus = btn.getAttribute('data-status');
        var oppId = btn.getAttribute('data-opp-id');
        apiPost('/api/opportunities/' + oppId + '/status', { status: newStatus })
          .then(function() { loadDetail(oppId); })
          .catch(function(e) { console.error('Status update error:', e); });
      });
    })(statusBtns[i]);
  }

  // Sliders — live update display value
  var sliders = document.querySelectorAll('.score-slider');
  for (var j = 0; j < sliders.length; j++) {
    (function(slider) {
      slider.addEventListener('input', function() {
        var dim = slider.getAttribute('data-dim');
        var valEl = document.getElementById('slider-val-' + dim);
        if (valEl) {
          var v = parseFloat(slider.value);
          valEl.textContent = (v % 1 === 0) ? v : v.toFixed(1);
        }
      });
    })(sliders[j]);
  }

  // Save scores button
  var saveBtn = document.getElementById('save-scores-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var oppId = saveBtn.getAttribute('data-opp-id');
      var manualDims = ['political_alignment','budget_availability','timing','competitive_landscape'];
      var payload = {};
      for (var k = 0; k < manualDims.length; k++) {
        var dim = manualDims[k];
        var sliderEl = document.getElementById('slider-' + dim);
        if (sliderEl) payload[dim] = parseFloat(sliderEl.value);
      }
      apiPost('/api/opportunities/' + oppId + '/score', payload)
        .then(function() { loadDetail(oppId); })
        .catch(function(e) { console.error('Save scores error:', e); });
    });
  }

  // View full brief button
  var briefBtn = document.getElementById('view-full-brief-btn');
  if (briefBtn) {
    briefBtn.addEventListener('click', function() {
      var oppId = briefBtn.getAttribute('data-opp-id');
      openBrief(oppId);
    });
  }
}

/* ============================================================
   4. ECHARTS — DETAIL PAGE
   ============================================================ */

function renderDetailRadar(scores) {
  var el = document.getElementById('detail-radar-chart');
  if (!el) return;

  if (APP.charts.detailRadar) {
    APP.charts.detailRadar.dispose();
    APP.charts.detailRadar = null;
  }

  var dims = [
    'data_strength','signal_recency','political_alignment','budget_availability',
    'capability_fit','competitive_landscape','timing','strategic_value',
    'engagement_size','signal_convergence'
  ];

  var indicators = [];
  var values = [];
  for (var i = 0; i < dims.length; i++) {
    indicators.push({ name: dimDisplayName(dims[i]), max: 10 });
    values.push(scores[dims[i]] || 0);
  }

  var chart = echarts.init(el, 'kpmg');
  APP.charts.detailRadar = chart;

  chart.setOption({
    tooltip: { trigger: 'item' },
    radar: {
      indicator: indicators,
      splitNumber: 5,
      axisName: { color: '#333333', fontSize: 11 }
    },
    series: [{
      type: 'radar',
      data: [{
        value: values,
        name: 'Score',
        areaStyle: { opacity: 0.3 },
        lineStyle: { color: '#00338D' },
        itemStyle: { color: '#00338D' }
      }]
    }]
  });
}

function formatMetricName(raw) {
  if (!raw) return '';
  return raw.replace(/_/g, ' ')
    .replace(/\bpct\b/gi, '%')
    .replace(/\bper 10k\b/gi, 'per 10k')
    .replace(/\bed\b/gi, 'ED')
    .replace(/\bhosp\b/gi, 'Hospital')
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function renderDetailGaps(gaps) {
  var el = document.getElementById('detail-gaps-chart');
  if (!el) return;

  if (APP.charts.detailGaps) {
    APP.charts.detailGaps.dispose();
    APP.charts.detailGaps = null;
  }

  if (!gaps || gaps.length === 0) return;

  // Sort by |gap_pct| descending, take top 8
  var sorted = gaps.slice().sort(function(a, b) {
    return Math.abs(b.gap_pct || 0) - Math.abs(a.gap_pct || 0);
  }).slice(0, 8);

  var metrics = [];
  var fullMetrics = [];
  var values = [];
  var barColors = [];
  for (var i = 0; i < sorted.length; i++) {
    var fullName = formatMetricName(sorted[i].metric);
    fullMetrics.push(fullName);
    // Truncate long labels for axis display
    metrics.push(fullName.length > 28 ? fullName.substring(0, 26) + '…' : fullName);
    var gv = sorted[i].gap_pct || 0;
    values.push(gv);
    barColors.push(gv >= 0 ? '#00C0AE' : '#AB0D82');
  }

  var chart = echarts.init(el, 'kpmg');
  APP.charts.detailGaps = chart;

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        var p = params[0];
        var idx = p.dataIndex;
        return '<strong>' + fullMetrics[idx] + '</strong><br/>Gap: ' + p.value.toFixed(1) + '%';
      }
    },
    grid: { left: '35%', right: 60, top: 10, bottom: 30 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: function(v) { return v + '%'; } }
    },
    yAxis: {
      type: 'category',
      data: metrics,
      axisLabel: {
        fontSize: 11,
        width: 180,
        overflow: 'truncate',
        ellipsis: '…'
      }
    },
    series: [{
      type: 'bar',
      data: values.map(function(v, idx) {
        return { value: v, itemStyle: { color: barColors[idx] } };
      }),
      label: {
        show: true,
        position: 'right',
        formatter: function(p) { return p.value.toFixed(1) + '%'; },
        fontSize: 11
      }
    }]
  });
}

/* ============================================================
   5. BRIEFING MODAL
   ============================================================ */

// Set up modal event listeners (called once on init)
(function _setupBriefListeners() {
  document.addEventListener('DOMContentLoaded', function() {
    var overlay = document.getElementById('brief-overlay');
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (!e.target.closest('.brief-modal')) {
          closeBrief();
        }
      });
    }

    var closeBtn = document.getElementById('brief-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { closeBrief(); });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var ov = document.getElementById('brief-overlay');
        if (ov && ov.classList.contains('brief-overlay--open')) {
          closeBrief();
        }
      }
    });
  });
})();

async function openBrief(id) {
  var overlay = document.getElementById('brief-overlay');
  if (overlay) overlay.classList.add('brief-overlay--open');

  var body = document.getElementById('brief-body');
  if (body) body.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>';

  try {
    var brief = await api('/api/opportunities/' + id + '/brief');
    renderBrief(brief);
  } catch (e) {
    // Fallback: use detail data (partial brief)
    try {
      var detail = await api('/api/opportunities/' + id);
      renderBrief(detail);
    } catch (e2) {
      if (body) body.innerHTML = '<div class="error-state">Unable to load brief. Please try again.</div>';
      console.error('openBrief error:', e2);
    }
  }
}

function closeBrief() {
  var overlay = document.getElementById('brief-overlay');
  if (overlay) overlay.classList.remove('brief-overlay--open');
}

function renderBrief(brief) {
  var body = document.getElementById('brief-body');
  if (!body) return;

  var opp = brief;
  var score = opp.composite_score || 0;
  var tier = tierLabel(score);
  var tierCls = tier.toLowerCase();
  var color = tierColor(score);
  var sensitivity = (opp.sensitivity || 'standard').toLowerCase();

  var offerings = opp.offerings || [];
  var estMin = 0;
  var estMax = 0;
  for (var i = 0; i < offerings.length; i++) {
    var off = offerings[i];
    var conf = off.confidence || 0;
    estMin += (off.typical_size_min || 0) * conf;
    estMax += (off.typical_size_max || 0) * conf;
  }

  var scores = opp.scores || {};
  var gaps = opp.gaps || [];
  var signals = opp.signals || [];
  var clientNews = opp.client_news || [];
  var related = opp.related_opportunities || [];
  var auditTrail = opp.audit_trail || [];
  var client = opp.client || null;

  var kpmgPalette = ['#00338D','#00B8F5','#1E49E2','#76D2FF','#7213EA','#B497FF','#00C0AE','#AB0D82'];
  var dims = [
    'data_strength','signal_recency','political_alignment','budget_availability',
    'capability_fit','competitive_landscape','timing','strategic_value',
    'engagement_size','signal_convergence'
  ];

  var html = '';

  // Brief Banner
  html += '<div class="brief-banner">';
  html += '  <div class="brief-banner__left">';
  html += '    <h2 class="brief-banner__title">' + escapeHtml(opp.title || '') + '</h2>';
  html += '    <div class="brief-banner__badges">';
  html += '      <span class="badge badge--sector">' + escapeHtml(formatSector(opp.sector || '')) + '</span>';
  html += '      <span class="badge badge--jurisdiction">' + escapeHtml(opp.jurisdiction || '') + '</span>';
  html += '      <span class="badge badge--' + tierCls + '">' + escapeHtml(tier) + '</span>';
  html += '      <span class="sensitivity-badge sensitivity-badge--' + escapeHtml(sensitivity) + '">' + escapeHtml(opp.sensitivity || 'Standard') + '</span>';
  html += '      <span class="badge badge--status">' + escapeHtml(opp.status || '') + '</span>';
  html += '    </div>';
  html += '  </div>';
  html += '  <div class="brief-banner__right">';
  html += '    <div class="brief-score-display">';
  html += '      <span class="brief-score-value" style="color:' + color + '">' + score.toFixed(1) + '</span>';
  html += '      <span class="brief-score-label">HORIZON Score</span>';
  html += '    </div>';
  html += '    <div class="brief-est-value">';
  html += '      <span class="brief-est-value__amount">' + formatCurrency(estMin) + '–' + formatCurrency(estMax) + '</span>';
  html += '      <span class="brief-est-value__label">Est. Value</span>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';

  // Brief Grid
  html += '<div class="brief-grid">';

  // LEFT COLUMN
  html += '<div class="brief-col">';

  // 1. Client Intelligence
  html += _briefSection('Client Intelligence', (function() {
    var s = '';
    if (client) {
      s += '<div class="brief-client-card">';
      s += '  <div class="brief-client-card__name">' + escapeHtml(client.name || '') + '</div>';
      s += '  <div class="brief-client-card__dept">' + escapeHtml(client.department || '') + '</div>';
      if (client.url) {
        s += '  <a class="brief-client-card__url" href="' + escapeHtml(client.url) + '" target="_blank" rel="noopener">' + escapeHtml(client.url) + '</a>';
      }
      s += '</div>';
      s += '<div class="brief-client-grid">';
      s += '  <div><strong>Portfolio</strong><span>' + escapeHtml(client.portfolio || '') + '</span></div>';
      s += '  <div><strong>Level</strong><span>' + escapeHtml(client.level || '') + '</span></div>';
      s += '  <div><strong>Budget</strong><span>' + (client.budget_m ? '$' + client.budget_m + 'm' : '') + '</span></div>';
      s += '  <div><strong>Jurisdiction</strong><span>' + escapeHtml(client.jurisdiction || '') + '</span></div>';
      s += '</div>';
      if (client.context) {
        s += '<div class="brief-client-section"><p>' + escapeHtml(client.context) + '</p></div>';
      }
    } else {
      s += '<p class="empty-state">No client matched.</p>';
    }
    return s;
  })());

  // 2. Client News
  html += _briefSection('Client News', (function() {
    if (clientNews.length === 0) return '<p class="empty-state">No client news available.</p>';
    var s = '';
    for (var i = 0; i < clientNews.length; i++) {
      var n = clientNews[i];
      s += '<div class="brief-news-item">';
      s += '  <div class="brief-news-item__header">';
      if (n.url) {
        s += '<a href="' + escapeHtml(n.url) + '" target="_blank" rel="noopener">' + escapeHtml(n.title || '') + '</a>';
      } else {
        s += escapeHtml(n.title || '');
      }
      s += '  </div>';
      s += '  <div class="brief-news-item__summary">' + escapeHtml(n.summary || '') + '</div>';
      s += '  <div class="brief-news-item__meta">';
      s += escapeHtml(n.source || '') + (n.published_at ? ' · ' + escapeHtml(formatDate(n.published_at)) : '');
      if (n.sentiment) s += ' · <span class="sentiment--' + escapeHtml(n.sentiment) + '">' + escapeHtml(n.sentiment) + '</span>';
      s += '  </div>';
      s += '</div>';
    }
    return s;
  })());

  // 3. Signals
  html += _briefSection('Signals', (function() {
    if (signals.length === 0) return '<p class="empty-state">No signals recorded.</p>';
    var s = '';
    for (var i = 0; i < signals.length; i++) {
      var sig = signals[i];
      s += '<div class="brief-signal-item">';
      s += '  <span class="signal-item__type">' + escapeHtml(sig.signal_type || '') + '</span>';
      if (sig.url) {
        s += ' <a href="' + escapeHtml(sig.url) + '" target="_blank" rel="noopener">' + escapeHtml(sig.title || '') + '</a>';
      } else {
        s += ' ' + escapeHtml(sig.title || '');
      }
      if (sig.body) {
        s += '  <div class="brief-signal-item__body">' + escapeHtml(sig.body) + '</div>';
      }
      s += '  <span class="signal-item__date">' + escapeHtml(formatDate(sig.date || sig.detected_at || '')) + '</span>';
      s += '</div>';
    }
    return s;
  })());

  // 4. Related Opportunities
  html += _briefSection('Related Opportunities', (function() {
    if (related.length === 0) return '<p class="empty-state">No related opportunities.</p>';
    var s = '';
    for (var i = 0; i < related.length; i++) {
      var rel = related[i];
      var relScore = rel.composite_score || 0;
      var relTier = tierLabel(relScore);
      var relTierClass = relTier.toLowerCase();
      s += '<div class="brief-related-item" data-rel-id="' + escapeHtml(String(rel.id)) + '" style="cursor:pointer">';
      s += '  <span class="opp-card__score" style="color:' + tierColor(relScore) + '">' + relScore.toFixed(1) + '</span>';
      s += '  <span class="brief-related-item__title">' + escapeHtml(rel.title || '') + '</span>';
      s += '  <span class="badge badge--sector">' + escapeHtml(formatSector(rel.sector || '')) + '</span>';
      s += '  <span class="badge badge--' + relTierClass + '">' + escapeHtml(relTier) + '</span>';
      s += '</div>';
    }
    return s;
  })());

  html += '</div>'; // end brief-col left

  // RIGHT COLUMN
  html += '<div class="brief-col">';

  // 5. Scoring Analysis
  html += _briefSection('Scoring Analysis', (function() {
    var s = '<div class="brief-radar" id="brief-radar-chart" style="width:100%;height:260px;"></div>';
    s += '<div class="brief-score-grid">';
    for (var i = 0; i < dims.length; i++) {
      var dim = dims[i];
      var dval = scores[dim] || 0;
      var barColor = kpmgPalette[i % kpmgPalette.length];
      var barW = Math.min(100, (dval / 10) * 100).toFixed(1);
      s += '<div class="brief-score-item">';
      s += '  <span class="score-grid-item__label">' + escapeHtml(dimDisplayName(dim)) + '</span>';
      s += '  <div class="score-grid-item__bar">';
      s += '    <div class="score-grid-item__fill" style="width:' + barW + '%;background:' + barColor + '"></div>';
      s += '  </div>';
      s += '  <span class="score-grid-item__val">' + (dval % 1 === 0 ? dval : dval.toFixed(1)) + '</span>';
      s += '</div>';
    }
    s += '</div>';
    return s;
  })());

  // 6. Matched Offerings
  html += _briefSection('Matched Offerings', (function() {
    if (offerings.length === 0) return '<p class="empty-state">No offerings matched.</p>';
    var s = '';
    for (var i = 0; i < offerings.length; i++) {
      var off2 = offerings[i];
      var confPct = Math.round((off2.confidence || 0) * 100);
      s += '<div class="brief-offering">';
      s += '  <div class="brief-offering__header">';
      s += '    <span class="brief-offering__name">' + escapeHtml(off2.name || '') + '</span>';
      s += '    <span class="brief-offering__conf">' + confPct + '%</span>';
      s += '  </div>';
      s += '  <div class="brief-offering__method">' + escapeHtml(off2.methodology || '') + '</div>';
      s += '  <div class="brief-offering__desc">' + escapeHtml(off2.description || '') + '</div>';
      s += '  <div class="brief-offering__size">' + formatCurrency(off2.typical_size_min) + '–' + formatCurrency(off2.typical_size_max) + ' typical</div>';
      if (off2.skill_command) {
        s += '  <div class="brief-offering__cmd"><code>' + escapeHtml(off2.skill_command) + '</code></div>';
      }
      s += '  <div class="confidence-bar"><div class="confidence-bar__fill" style="width:' + confPct + '%"></div></div>';
      s += '</div>';
    }
    return s;
  })());

  // 7. Jurisdiction Gaps
  html += _briefSection('Jurisdiction Gaps', (function() {
    var s = '<div class="brief-gaps-chart" id="brief-gaps-chart" style="width:100%;height:220px;"></div>';
    if (gaps.length > 0) {
      var mixedJ = gaps.some(function(g) { return g.jurisdiction_a !== gaps[0].jurisdiction_a; });
      var hdrA = mixedJ ? 'Jurisdiction' : escapeHtml(gaps[0].jurisdiction_a || 'A');
      var hdrB = escapeHtml(gaps[0].jurisdiction_b || 'National');
      s += '<table class="brief-table">';
      s += '<thead><tr><th>Metric</th><th>' + hdrA + '</th><th>' + hdrB + '</th><th>Gap</th></tr></thead>';
      s += '<tbody>';
      for (var i = 0; i < gaps.length; i++) {
        var g = gaps[i];
        var gPct = g.gap_pct || 0;
        var gCol = gPct >= 0 ? '#00C0AE' : '#AB0D82';
        var valA = mixedJ
          ? escapeHtml(g.jurisdiction_a || '') + ' ' + escapeHtml(String(g.value_a || ''))
          : escapeHtml(String(g.value_a || ''));
        s += '<tr>';
        s += '<td>' + escapeHtml(formatMetricName(g.metric)) + '</td>';
        s += '<td>' + valA + '</td>';
        s += '<td>' + escapeHtml(String(g.value_b || '')) + '</td>';
        s += '<td style="color:' + gCol + ';font-weight:bold">' + (gPct >= 0 ? '+' : '') + gPct.toFixed(1) + '%</td>';
        s += '</tr>';
      }
      s += '</tbody></table>';
    }
    return s;
  })());

  // 8. Audit Trail
  html += _briefSection('Audit Trail', (function() {
    if (auditTrail.length === 0) return '<p class="empty-state">No audit records.</p>';
    var s = '';
    for (var i = 0; i < auditTrail.length; i++) {
      var entry = auditTrail[i];
      s += '<div class="brief-audit-item">';
      s += '  <span class="brief-audit-item__time">' + escapeHtml(formatDate(entry.timestamp || entry.time || '')) + '</span>';
      s += '  <span class="brief-audit-item__action">' + escapeHtml(entry.action || '') + '</span>';
      s += '</div>';
    }
    return s;
  })());

  html += '</div>'; // end brief-col right
  html += '</div>'; // end brief-grid

  body.innerHTML = html;

  // Init charts
  renderBriefRadar(scores);
  renderBriefGaps(gaps);

  // Collapsible sections
  _attachBriefCollapsibles(body);

  // Related opportunity links
  var relItems = body.querySelectorAll('.brief-related-item');
  for (var ri = 0; ri < relItems.length; ri++) {
    (function(item) {
      item.addEventListener('click', function() {
        var relId = item.getAttribute('data-rel-id');
        closeBrief();
        if (relId) loadDetail(relId);
      });
    })(relItems[ri]);
  }
}

/** Build a collapsible brief section HTML */
function _briefSection(title, bodyHtml) {
  return (
    '<div class="brief-section">' +
    '  <div class="brief-section__header">' +
    '    <span class="brief-section__title">' + escapeHtml(title) + '</span>' +
    '    <span class="brief-section__chevron">▼</span>' +
    '  </div>' +
    '  <div class="brief-section__body">' + bodyHtml + '</div>' +
    '</div>'
  );
}

/** Attach click handlers to all collapsible section headers inside a container */
function _attachBriefCollapsibles(container) {
  var headers = container.querySelectorAll('.brief-section__header');
  for (var i = 0; i < headers.length; i++) {
    (function(header) {
      header.addEventListener('click', function() {
        var sectionBody = header.nextElementSibling;
        if (!sectionBody) return;
        var collapsed = sectionBody.classList.toggle('brief-section__body--collapsed');
        var chevron = header.querySelector('.brief-section__chevron');
        if (chevron) chevron.textContent = collapsed ? '▲' : '▼';
      });
    })(headers[i]);
  }
}

/* ============================================================
   6. BRIEF ECHARTS
   ============================================================ */

function renderBriefRadar(scores) {
  var el = document.getElementById('brief-radar-chart');
  if (!el) return;

  if (APP.charts.briefRadar) {
    APP.charts.briefRadar.dispose();
    APP.charts.briefRadar = null;
  }

  var dims = [
    'data_strength','signal_recency','political_alignment','budget_availability',
    'capability_fit','competitive_landscape','timing','strategic_value',
    'engagement_size','signal_convergence'
  ];

  var indicators = [];
  var values = [];
  for (var i = 0; i < dims.length; i++) {
    indicators.push({ name: dimDisplayName(dims[i]), max: 10 });
    values.push(scores[dims[i]] || 0);
  }

  var chart = echarts.init(el, 'kpmg');
  APP.charts.briefRadar = chart;

  chart.setOption({
    tooltip: { trigger: 'item' },
    radar: {
      indicator: indicators,
      splitNumber: 5,
      axisName: { color: '#333333', fontSize: 11 }
    },
    series: [{
      type: 'radar',
      data: [{
        value: values,
        name: 'Score',
        areaStyle: { opacity: 0.3 },
        lineStyle: { color: '#00338D' },
        itemStyle: { color: '#00338D' }
      }]
    }]
  });
}

function renderBriefGaps(gaps) {
  var el = document.getElementById('brief-gaps-chart');
  if (!el) return;

  if (APP.charts.briefGaps) {
    APP.charts.briefGaps.dispose();
    APP.charts.briefGaps = null;
  }

  if (!gaps || gaps.length === 0) return;

  var sorted = gaps.slice().sort(function(a, b) {
    return Math.abs(b.gap_pct || 0) - Math.abs(a.gap_pct || 0);
  }).slice(0, 8);

  var metrics = [];
  var fullMetrics = [];
  var values = [];
  var barColors = [];
  for (var i = 0; i < sorted.length; i++) {
    var fullName = formatMetricName(sorted[i].metric);
    fullMetrics.push(fullName);
    metrics.push(fullName.length > 28 ? fullName.substring(0, 26) + '…' : fullName);
    var gv = sorted[i].gap_pct || 0;
    values.push(gv);
    barColors.push(gv >= 0 ? '#00C0AE' : '#AB0D82');
  }

  var chart = echarts.init(el, 'kpmg');
  APP.charts.briefGaps = chart;

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        var p = params[0];
        var idx = p.dataIndex;
        return '<strong>' + fullMetrics[idx] + '</strong><br/>Gap: ' + p.value.toFixed(1) + '%';
      }
    },
    grid: { left: '35%', right: 60, top: 10, bottom: 30 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: function(v) { return v + '%'; } }
    },
    yAxis: {
      type: 'category',
      data: metrics,
      axisLabel: {
        fontSize: 11,
        width: 160,
        overflow: 'truncate',
        ellipsis: '…'
      }
    },
    series: [{
      type: 'bar',
      data: values.map(function(v, idx) {
        return { value: v, itemStyle: { color: barColors[idx] } };
      }),
      label: {
        show: true,
        position: 'right',
        formatter: function(p) { return p.value.toFixed(1) + '%'; },
        fontSize: 11
      }
    }]
  });
}
