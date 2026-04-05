// ================================================================
// HORIZON BD Opportunity Engine — Pipeline Page + Core App JS
// Multi-page SPA with hash-based routing
// ================================================================

// ================================================================
// 1. ECharts KPMG Theme Registration
// ================================================================
function registerKpmgTheme() {
    echarts.registerTheme('kpmg', {
        color: ['#00338D', '#00B8F5', '#1E49E2', '#76D2FF', '#7213EA', '#B497FF', '#00C0AE', '#AB0D82'],
        backgroundColor: 'transparent',
        textStyle: {
            fontFamily: 'Arial, Helvetica, sans-serif',
            color: '#333333',
            fontSize: 12
        },
        title: {
            textStyle: {
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#00338D',
                fontWeight: 'bold',
                fontSize: 14
            },
            subtextStyle: {
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#666666',
                fontSize: 11
            }
        },
        tooltip: {
            backgroundColor: '#00338D',
            textStyle: {
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#FFFFFF',
                fontSize: 12
            },
            borderColor: '#1E49E2',
            borderWidth: 1
        },
        legend: {
            textStyle: {
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#333333',
                fontSize: 11
            }
        },
        categoryAxis: {
            axisLine: { lineStyle: { color: '#E5E5E5' } },
            axisLabel: { fontFamily: 'Arial, Helvetica, sans-serif', color: '#666666', fontSize: 11 },
            splitLine: { lineStyle: { color: '#E5E5E5' } }
        },
        valueAxis: {
            axisLine: { lineStyle: { color: '#E5E5E5' } },
            axisLabel: { fontFamily: 'Arial, Helvetica, sans-serif', color: '#666666', fontSize: 11 },
            splitLine: { lineStyle: { color: '#E5E5E5' } }
        }
    });
}

// ================================================================
// 2. App State
// ================================================================
var APP = {
    opportunities: [],
    stats: null,
    currentOpp: null,
    charts: {},
    map: null,
    filters: { status: '', sector: '', search: '', jurisdiction: '', tier: '' },
    sort: 'score', // 'score' | 'recent' | 'sector'
    feedPageSize: 50,
    feedDisplayed: 50
};

// ================================================================
// Internal constants
// ================================================================
var TIER_COLORS = {
    hot:   '#7213EA',
    warm:  '#1E49E2',
    watch: '#00B8F5',
    cold:  '#666666'
};

var THRESHOLDS = { hot: 80, warm: 60, watch: 40 };

function getTier(score) {
    if (score >= THRESHOLDS.hot)  return 'hot';
    if (score >= THRESHOLDS.warm) return 'warm';
    if (score >= THRESHOLDS.watch) return 'watch';
    return 'cold';
}

function escapeHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function formatSector(s) {
    if (!s) return 'Unclassified';
    return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// ================================================================
// 4. API Helpers
// ================================================================
function _resolveStatic(path) {
    if (typeof HORIZON_DATA === 'undefined') return undefined;
    var clean = path.split('?')[0].replace(/\/$/, '');

    if (clean === '/api/stats') return HORIZON_DATA.stats;
    if (clean === '/api/opportunities') return HORIZON_DATA.opportunities;
    if (clean === '/api/scheduler') return HORIZON_DATA.scheduler;

    var detailMatch = clean.match(/^\/api\/opportunities\/(\d+)$/);
    if (detailMatch) {
        return HORIZON_DATA.details ? HORIZON_DATA.details[detailMatch[1]] : undefined;
    }

    var briefMatch = clean.match(/^\/api\/opportunities\/(\d+)\/brief$/);
    if (briefMatch) {
        return HORIZON_DATA.briefs ? HORIZON_DATA.briefs[briefMatch[1]] : undefined;
    }

    return undefined;
}

function api(path) {
    var isFileProtocol = window.location.protocol === 'file:';

    // Tier 1: Always try static data first — instant, no race conditions
    var staticResult = _resolveStatic(path);
    if (staticResult !== undefined && staticResult !== null) {
        return Promise.resolve(staticResult);
    }

    // Tier 2: If SW is controlling this page, try fetch (SW intercepts /api/* if seeded)
    if (!isFileProtocol && navigator.serviceWorker && navigator.serviceWorker.controller) {
        return fetch(path).then(function(r) {
            if (r.ok) return r.json();
            throw new Error(r.status + ' ' + r.statusText);
        });
    }

    // Tier 3: On file:// protocol, network fetch will fail — reject gracefully
    if (isFileProtocol) {
        return Promise.reject(new Error('No static data available for ' + path + ' (file:// mode)'));
    }

    // Tier 4: Direct network fetch (server mode)
    return fetch(path).then(function(r) {
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        return r.json();
    });
}

function apiPost(path, body) {
    var isFileProtocol = window.location.protocol === 'file:';

    // Tier 1: Always try static mutation first
    var staticResult = _staticPost(path, body);
    if (staticResult !== null) return staticResult;

    // Tier 2: SW or network fetch
    if (isFileProtocol) {
        return Promise.reject(new Error('Cannot POST in file:// mode'));
    }

    return fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(r) {
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        return r.json();
    });
}

function _staticPost(path, body) {
    if (typeof HORIZON_DATA === 'undefined') return null;
    var clean = path.split('?')[0].replace(/\/$/, '');
    var scoreMatch = clean.match(/^\/api\/opportunities\/(\d+)\/score$/);
    if (scoreMatch && body) {
        var id = scoreMatch[1];
        if (HORIZON_DATA.details && HORIZON_DATA.details[id] && body.scores) {
            var d = HORIZON_DATA.details[id];
            for (var k in body.scores) { d.scores[k] = body.scores[k]; }
            if (body.composite_score !== undefined) d.composite_score = body.composite_score;
        }
        return Promise.resolve({ ok: true, id: parseInt(id) });
    }
    var statusMatch = clean.match(/^\/api\/opportunities\/(\d+)\/status$/);
    if (statusMatch && body && body.status) {
        var sid = statusMatch[1];
        if (HORIZON_DATA.details && HORIZON_DATA.details[sid]) {
            HORIZON_DATA.details[sid].status = body.status;
        }
        if (HORIZON_DATA.opportunities) {
            HORIZON_DATA.opportunities.forEach(function(o) {
                if (String(o.id) === sid) o.status = body.status;
            });
        }
        return Promise.resolve({ ok: true, id: parseInt(sid), status: body.status });
    }
    return null;
}

// ================================================================
// 3. Router
// ================================================================
function router() {
    var hash = window.location.hash || '';
    var pipelinePage = document.getElementById('view-pipeline');
    var detailPage   = document.getElementById('view-detail');
    var btnBack      = document.querySelector('.btn-back');

    // Parse hash
    var oppMatch = hash.match(/^#opportunity\/(\d+)$/);

    if (oppMatch) {
        // Detail page
        if (pipelinePage) pipelinePage.classList.remove('page--active');
        if (detailPage)   detailPage.classList.add('page--active');
        if (btnBack)      btnBack.style.display = '';
        var id = parseInt(oppMatch[1], 10);
        loadDetail(id);
    } else {
        // Pipeline page ('' or '#pipeline')
        if (pipelinePage) pipelinePage.classList.add('page--active');
        if (detailPage)   detailPage.classList.remove('page--active');
        if (btnBack)      btnBack.style.display = 'none';
        loadPipeline();
    }
}

// ================================================================
// 5. Pipeline Loading
// ================================================================
function loadPipeline() {
    if (typeof initMap === 'function') initMap();
    if (typeof onPipelinePageVisible === 'function') onPipelinePageVisible();
    return Promise.all([loadStats(), loadOpportunities()]);
}

function loadStats() {
    return api('/api/stats').then(function (data) {
        APP.stats = data;
        renderKPIs(data);
        renderCharts(data);
    }).catch(function (err) {
        console.error('loadStats failed:', err);
    });
}

function loadOpportunities() {
    return api('/api/opportunities').then(function (data) {
        APP.opportunities = data;
        renderFeed(data);
        if (typeof updateMapMarkers === 'function') {
            updateMapMarkers(data);
        }
        setupFilters();
    }).catch(function (err) {
        console.error('loadOpportunities failed:', err);
        var feed = document.getElementById('opp-feed');
        if (feed) {
            feed.innerHTML = '<div class="empty-state">No data available. Run <code>horizon.py init</code> then <code>horizon.py pull</code>.</div>';
        }
    });
}

// ================================================================
// 6. KPI Rendering
// ================================================================
function renderKPIs(stats) {
    var row = document.getElementById('kpi-row');
    if (!row) return;

    var cards = [
        {
            label: 'Opportunities',
            value: (stats.opp_count || 0).toLocaleString(),
            modifier: '',
            accent: '#00338D'
        },
        {
            label: 'Hot',
            value: (stats.hot || 0).toLocaleString(),
            modifier: 'kpi-card__value--purple',
            accent: '#7213EA'
        },
        {
            label: 'Warm',
            value: (stats.warm || 0).toLocaleString(),
            modifier: 'kpi-card__value--warm',
            accent: '#1E49E2'
        },
        {
            label: 'Signals',
            value: (stats.signal_count || 0).toLocaleString(),
            modifier: 'kpi-card__value--pacific',
            accent: '#00B8F5'
        },
        {
            label: 'Gaps',
            value: (stats.gap_count || 0).toLocaleString(),
            modifier: 'kpi-card__value--cobalt',
            accent: '#1E49E2'
        }
    ];

    row.innerHTML = '';
    cards.forEach(function (card) {
        var el = document.createElement('div');
        el.className = 'kpi-card';
        el.setAttribute('role', 'listitem');
        el.style.borderLeftColor = card.accent;

        var labelEl = document.createElement('div');
        labelEl.className = 'kpi-card__label';
        labelEl.textContent = card.label;

        var valueEl = document.createElement('div');
        valueEl.className = 'kpi-card__value' + (card.modifier ? ' ' + card.modifier : '');
        valueEl.textContent = card.value;

        el.appendChild(labelEl);
        el.appendChild(valueEl);
        row.appendChild(el);
    });
}

// ================================================================
// 7. Feed Rendering
// ================================================================
function getFilteredOpps() {
    if (!APP.opportunities) return [];
    var statusFilter = APP.filters.status;
    var sectorFilter = APP.filters.sector;
    var jurisdictionFilter = APP.filters.jurisdiction;
    var tierFilter = APP.filters.tier;
    var searchText   = APP.filters.search.toLowerCase().trim();

    return APP.opportunities.filter(function (o) {
        if (statusFilter && o.status !== statusFilter) return false;
        if (sectorFilter && o.sector !== sectorFilter) return false;
        if (jurisdictionFilter && o.jurisdiction !== jurisdictionFilter) return false;
        if (tierFilter && getTier(o.composite_score || 0) !== tierFilter) return false;
        if (searchText && (o.title || '').toLowerCase().indexOf(searchText) === -1) return false;
        return true;
    });
}

function sortOpps(list) {
    var sorted = list.slice();
    if (APP.sort === 'score') {
        sorted.sort(function (a, b) {
            return (b.composite_score || 0) - (a.composite_score || 0);
        });
    } else if (APP.sort === 'recent') {
        sorted.sort(function (a, b) {
            return (b.updated_at || '').localeCompare(a.updated_at || '');
        });
    } else if (APP.sort === 'sector') {
        sorted.sort(function (a, b) {
            var cmp = (a.sector || '').localeCompare(b.sector || '');
            if (cmp !== 0) return cmp;
            return (b.composite_score || 0) - (a.composite_score || 0);
        });
    }
    return sorted;
}

function renderFeed() {
    var feed = document.getElementById('opp-feed');
    if (!feed) return;

    var filtered = sortOpps(getFilteredOpps());

    var countEl = document.getElementById('feed-count');
    if (countEl) {
        countEl.textContent = filtered.length + ' of ' + APP.opportunities.length;
    }

    if (filtered.length === 0) {
        feed.innerHTML = '<div class="empty-state">No opportunities match current filters.</div>';
        return;
    }

    // Paginate: only render up to feedDisplayed items
    var displayed = Math.min(APP.feedDisplayed, filtered.length);
    var html = '';
    for (var i = 0; i < displayed; i++) {
        var opp = filtered[i];
        var score = (opp.composite_score || 0);
        var tier  = getTier(score);
        var scoreColor;
        if (score >= 80)      scoreColor = TIER_COLORS.hot;
        else if (score >= 60) scoreColor = TIER_COLORS.warm;
        else if (score >= 40) scoreColor = TIER_COLORS.watch;
        else                  scoreColor = '#666666';

        html += '<div class="opp-card" data-id="' + opp.id + '" data-sector="' + escapeHtml(opp.sector || '') + '" style="border-left:4px solid ' + scoreColor + '">';
        html += '<div class="opp-card__title">' + escapeHtml(opp.title) + '</div>';
        html += '<div class="opp-card__meta">';
        html += '<span class="opp-card__score" style="color:' + scoreColor + '">' + score.toFixed(1) + '</span>';
        html += '<span class="badge badge--sector">' + escapeHtml(formatSector(opp.sector)) + '</span>';
        if (opp.jurisdiction) {
            html += '<span class="badge badge--jurisdiction">' + escapeHtml(opp.jurisdiction) + '</span>';
        }
        html += '<span class="badge badge--' + tier + '">' + tier.toUpperCase() + '</span>';
        html += '</div>';
        html += '</div>';
    }

    // Show more button if there are remaining items
    if (displayed < filtered.length) {
        var remaining = filtered.length - displayed;
        html += '<button class="btn btn--show-more" id="show-more-btn">';
        html += 'Show more (' + remaining + ' remaining)';
        html += '</button>';
    }

    feed.innerHTML = html;

    // Attach click handlers — navigate to detail page via hash
    feed.querySelectorAll('.opp-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var id = this.getAttribute('data-id');
            window.location.hash = '#opportunity/' + id;
        });
    });

    // Show more button handler
    var showMoreBtn = document.getElementById('show-more-btn');
    if (showMoreBtn) {
        showMoreBtn.addEventListener('click', function () {
            APP.feedDisplayed += APP.feedPageSize;
            renderFeed();
        });
    }
}

// ================================================================
// 8. Filter & Sort Setup
// ================================================================
function setupFilters() {
    // Populate sector dropdown from unique sectors in APP.opportunities
    var sectorSelect = document.getElementById('filter-sector');
    if (sectorSelect) {
        var sectors = {};
        APP.opportunities.forEach(function (o) {
            if (o.sector) sectors[o.sector] = true;
        });
        // Clear existing options beyond first (All Sectors)
        while (sectorSelect.options.length > 1) sectorSelect.remove(1);
        Object.keys(sectors).sort().forEach(function (s) {
            var opt = document.createElement('option');
            opt.value = s;
            opt.textContent = formatSector(s);
            sectorSelect.appendChild(opt);
        });
        // Restore current filter value if still valid
        if (APP.filters.sector) {
            sectorSelect.value = APP.filters.sector;
            if (sectorSelect.value !== APP.filters.sector) {
                APP.filters.sector = '';
            }
        }
    }

    // Populate jurisdiction dropdown
    var jurisdictionSelect = document.getElementById('filter-jurisdiction');
    if (jurisdictionSelect) {
        var jurisdictions = {};
        APP.opportunities.forEach(function (o) {
            if (o.jurisdiction) jurisdictions[o.jurisdiction] = true;
        });
        while (jurisdictionSelect.options.length > 1) jurisdictionSelect.remove(1);
        Object.keys(jurisdictions).sort().forEach(function (j) {
            var opt = document.createElement('option');
            opt.value = j;
            opt.textContent = j;
            jurisdictionSelect.appendChild(opt);
        });
        if (APP.filters.jurisdiction) {
            jurisdictionSelect.value = APP.filters.jurisdiction;
            if (jurisdictionSelect.value !== APP.filters.jurisdiction) {
                APP.filters.jurisdiction = '';
            }
        }
    }

    // Status filter
    var statusSelect = document.getElementById('filter-status');
    if (statusSelect && !statusSelect._horizonBound) {
        statusSelect._horizonBound = true;
        statusSelect.addEventListener('change', function () {
            APP.filters.status = this.value;
            APP.feedDisplayed = APP.feedPageSize;
            renderFeed();
        });
    }

    // Sector filter
    if (sectorSelect && !sectorSelect._horizonBound) {
        sectorSelect._horizonBound = true;
        sectorSelect.addEventListener('change', function () {
            APP.filters.sector = this.value;
            APP.feedDisplayed = APP.feedPageSize;
            renderFeed();
        });
    }

    // Jurisdiction filter
    if (jurisdictionSelect && !jurisdictionSelect._horizonBound) {
        jurisdictionSelect._horizonBound = true;
        jurisdictionSelect.addEventListener('change', function () {
            APP.filters.jurisdiction = this.value;
            APP.feedDisplayed = APP.feedPageSize;
            renderFeed();
        });
    }

    // Tier filter
    var tierSelect = document.getElementById('filter-tier');
    if (tierSelect && !tierSelect._horizonBound) {
        tierSelect._horizonBound = true;
        tierSelect.addEventListener('change', function () {
            APP.filters.tier = this.value;
            APP.feedDisplayed = APP.feedPageSize;
            renderFeed();
        });
    }

    // Search input (debounced)
    var searchInput = document.getElementById('filter-search');
    if (searchInput && !searchInput._horizonBound) {
        searchInput._horizonBound = true;
        var searchTimeout = null;
        searchInput.addEventListener('input', function () {
            var val = this.value;
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function () {
                APP.filters.search = val;
                APP.feedDisplayed = APP.feedPageSize;
                renderFeed();
            }, 200);
        });
    }

    // Sort buttons
    document.querySelectorAll('.opp-sort__btn').forEach(function (btn) {
        if (!btn._horizonBound) {
            btn._horizonBound = true;
            btn.addEventListener('click', function () {
                document.querySelectorAll('.opp-sort__btn').forEach(function (b) {
                    b.classList.remove('opp-sort__btn--active');
                });
                this.classList.add('opp-sort__btn--active');
                var sortVal = this.getAttribute('data-sort');
                // Normalise 'recency' → 'recent' for APP.sort
                APP.sort = (sortVal === 'recency') ? 'recent' : sortVal;
                APP.feedDisplayed = APP.feedPageSize;
                renderFeed();
            });
        }
    });
}

// ================================================================
// 9. Chart Rendering
// ================================================================
function renderCharts(stats) {
    renderSectorChart(stats);
    renderTierChart(stats);

    // Resize all charts on window resize
    if (!window._horizonResizeBound) {
        window._horizonResizeBound = true;
        var resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                Object.keys(APP.charts).forEach(function (key) {
                    if (APP.charts[key] && APP.charts[key].resize) {
                        try { APP.charts[key].resize(); } catch (e) { /* ignore */ }
                    }
                });
            }, 100);
        });
    }
}

function renderSectorChart(stats) {
    var el = document.getElementById('chart-sector');
    if (!el) return;

    if (APP.charts['chart-sector']) {
        APP.charts['chart-sector'].dispose();
    }

    var topSectors = (stats.top_sectors || []);
    var chart = echarts.init(el, 'kpmg');
    APP.charts['chart-sector'] = chart;

    chart.setOption({
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)'
        },
        legend: {
            orient: 'horizontal',
            bottom: 0,
            left: 'center',
            textStyle: { fontSize: 10, color: '#333333' },
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 8
        },
        grid: { bottom: 40 },
        series: [{
            type: 'pie',
            radius: ['25%', '52%'],
            center: ['50%', '42%'],
            label: {
                show: true,
                position: 'outside',
                formatter: '{d}%',
                fontSize: 10,
                color: '#333333'
            },
            labelLine: { show: true, length: 8, length2: 6 },
            data: topSectors.map(function (item) {
                return { name: formatSector(item.sector), value: item.count };
            }),
            emphasis: {
                itemStyle: { shadowBlur: 6, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' }
            }
        }]
    });
}

function renderTierChart(stats) {
    var el = document.getElementById('chart-tier');
    if (!el) return;

    if (APP.charts['chart-tier']) {
        APP.charts['chart-tier'].dispose();
    }

    var chart = echarts.init(el, 'kpmg');
    APP.charts['chart-tier'] = chart;

    var tiers  = ['Hot', 'Warm', 'Watch', 'Cold'];
    var values = [
        stats.hot   || 0,
        stats.warm  || 0,
        stats.watch || 0,
        stats.cold  || 0
    ];
    var colors = [
        TIER_COLORS.hot,
        TIER_COLORS.warm,
        TIER_COLORS.watch,
        TIER_COLORS.cold
    ];

    chart.setOption({
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        grid: { left: 56, right: 16, top: 12, bottom: 24 },
        xAxis: {
            type: 'value',
            axisLabel: { fontSize: 11 },
            splitLine: { lineStyle: { color: '#E5E5E5' } }
        },
        yAxis: {
            type: 'category',
            data: tiers,
            axisLabel: { fontSize: 11, color: '#333333' },
            axisTick: { show: false }
        },
        series: [{
            type: 'bar',
            data: values.map(function (v, i) {
                return {
                    value: v,
                    itemStyle: { color: colors[i] }
                };
            }),
            barMaxWidth: 24,
            label: {
                show: true,
                position: 'right',
                fontSize: 11,
                color: '#333333'
            },
            emphasis: { itemStyle: { opacity: 0.85 } }
        }]
    });
}

// ================================================================
// 10. Scheduler Status
// ================================================================
function loadSchedulerStatus() {
    return api('/api/scheduler').then(function (data) {
        var dot  = document.getElementById('scheduler-dot');
        var text = document.getElementById('scheduler-text');
        var refreshEl = document.getElementById('last-refresh');

        if (dot) {
            dot.className = data.running
                ? 'scheduler-dot scheduler-dot--active'
                : 'scheduler-dot scheduler-dot--inactive';
        }

        if (text) {
            if (data.running && data.run_at) {
                text.textContent = 'Auto-refresh ' + data.run_at;
            } else if (data.running) {
                text.textContent = 'Active';
            } else {
                text.textContent = 'Inactive';
            }
        }

        if (refreshEl) {
            var now = new Date();
            refreshEl.textContent = 'Updated ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // Set tooltip on scheduler container
        var container = document.getElementById('scheduler-status');
        if (container) {
            container.title = data.running
                ? 'Scheduler active — daily pipeline at ' + (data.run_at || '')
                : 'Scheduler inactive — data refreshed manually';
        }
    }).catch(function () {
        // Show default state when scheduler API is unavailable
        var dot  = document.getElementById('scheduler-dot');
        var text = document.getElementById('scheduler-text');
        var refreshEl = document.getElementById('last-refresh');
        if (dot) dot.className = 'scheduler-dot scheduler-dot--inactive';
        if (text) text.textContent = 'Manual';
        if (refreshEl) {
            var now = new Date();
            refreshEl.textContent = 'Updated ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    });
}

// ================================================================
// 11. Auto-refresh (poll for new data every 5 minutes)
// ================================================================
var AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function autoRefresh() {
    var hash = window.location.hash || '';
    var onPipeline = !hash || hash === '#pipeline';

    if (onPipeline) {
        // Full refresh of pipeline data
        loadStats();
        loadOpportunities();
    }
    // Always update scheduler status
    loadSchedulerStatus();
}

// ================================================================
// 12. Boot
// ================================================================
function initApp() {
    registerKpmgTheme();
    setupFilters();
    window.addEventListener('hashchange', router);
    router(); // initial route
    loadSchedulerStatus();

    // Periodic auto-refresh only when running against a live server
    if (typeof HORIZON_DATA === 'undefined') {
        setInterval(loadSchedulerStatus, 60000);
        setInterval(autoRefresh, AUTO_REFRESH_INTERVAL);
    }
}

document.addEventListener('DOMContentLoaded', initApp);
