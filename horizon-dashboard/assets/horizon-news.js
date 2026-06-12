// ================================================================
// HORIZON News Page — sector news browsing in the HORIZON SPA
// ================================================================

(function() {
'use strict';

// News page state on global APP object
if (typeof APP !== 'undefined') {
    APP.news = {
        articles: {},
        summaries: {},
        activeSector: 'all',
        activeView: 'summary',
        activeDays: 30,
        searchText: '',
        loaded: false
    };
}

// Sector metadata (colours from KPMG palette)
var NEWS_SECTORS = {
    aged_care:        { label: 'Aged Care',               colour: '#00338D' },
    disability:       { label: 'NDIS & Disability',       colour: '#00B8F5' },
    health:           { label: 'Health',                  colour: '#1E49E2' },
    child_protection: { label: 'Child Protection',        colour: '#7213EA' },
    education:        { label: 'Education',               colour: '#76D2FF' },
    housing:          { label: 'Housing & Homelessness',  colour: '#00C0AE' },
    infrastructure:   { label: 'Infrastructure',          colour: '#AB0D82' },
    general:          { label: 'Public Service & Budget', colour: '#B497FF' }
};

// ================================================================
// Data Loading
// ================================================================

function loadNews() {
    if (APP.news.loaded) {
        renderNewsPage();
        return;
    }
    api('/api/news').then(function(data) {
        APP.news.articles = data.sectors || {};
        APP.news.summaries = data.summaries || {};
        APP.news.loaded = true;
        renderNewsPage();
    }).catch(function(err) {
        console.error('[News] Failed to load:', err);
        var el = document.getElementById('news-empty-state');
        if (el) {
            el.textContent = 'Failed to load news data.';
            el.classList.remove('hidden');
        }
    });
}

// ================================================================
// Rendering
// ================================================================

function renderNewsPage() {
    renderNewsSummaryBar();
    renderNewsControls();
    applyNewsFilters();
}

function renderNewsSummaryBar() {
    var el = document.getElementById('news-summary-bar');
    if (!el) return;

    var totalArticles = 0;
    var sectorCount = 0;
    var trustedCount = 0;

    for (var sid in APP.news.articles) {
        var articles = APP.news.articles[sid];
        if (articles.length > 0) sectorCount++;
        for (var i = 0; i < articles.length; i++) {
            totalArticles++;
            if (articles[i].is_trusted) trustedCount++;
        }
    }

    el.innerHTML =
        '<div class="kpi-card" role="listitem">' +
            '<div class="kpi-label">Total Articles</div>' +
            '<div class="kpi-value">' + totalArticles + '</div>' +
        '</div>' +
        '<div class="kpi-card" role="listitem">' +
            '<div class="kpi-label">Sectors</div>' +
            '<div class="kpi-value">' + sectorCount + '/8</div>' +
        '</div>' +
        '<div class="kpi-card" role="listitem">' +
            '<div class="kpi-label">Trusted Source</div>' +
            '<div class="kpi-value">' + trustedCount + '</div>' +
        '</div>';
}

function renderNewsControls() {
    var el = document.getElementById('news-controls');
    if (!el) return;

    var html = '';

    // Sector filters
    html += '<button class="filter-btn active" data-sector="all" onclick="filterNewsSector(\'all\')">All</button>';
    for (var sid in NEWS_SECTORS) {
        var sec = NEWS_SECTORS[sid];
        var count = (APP.news.articles[sid] || []).length;
        if (count === 0) continue;
        html += '<button class="filter-btn" data-sector="' + sid + '" ' +
                'onclick="filterNewsSector(\'' + sid + '\')">' +
                sec.label + ' (' + count + ')</button>';
    }

    // Search
    html += '<input class="news-search" type="text" placeholder="Search articles…" ' +
            'oninput="searchNews(this.value)" value="' + escapeHtml(APP.news.searchText) + '">';

    // Date filter
    html += '<div class="news-date-filter">';
    html += '<button class="' + (APP.news.activeDays === 30 ? 'active' : '') + '" onclick="filterNewsDays(30)">30d</button>';
    html += '<button class="' + (APP.news.activeDays === 7 ? 'active' : '') + '" onclick="filterNewsDays(7)">7d</button>';
    html += '<button class="' + (APP.news.activeDays === 1 ? 'active' : '') + '" onclick="filterNewsDays(1)">1d</button>';
    html += '</div>';

    // View toggle
    html += '<div class="news-view-toggle">';
    html += '<button class="' + (APP.news.activeView === 'summary' ? 'active' : '') + '" onclick="toggleNewsView(\'summary\')">Summary</button>';
    html += '<button class="' + (APP.news.activeView === 'cards' ? 'active' : '') + '" onclick="toggleNewsView(\'cards\')">Cards</button>';
    html += '</div>';

    el.innerHTML = html;
}

function renderNewsSummaries() {
    var el = document.getElementById('news-summaries');
    if (!el) return;

    var html = '';
    for (var sid in NEWS_SECTORS) {
        var articles = _filteredArticles(sid);
        if (articles.length === 0) continue;

        var sec = NEWS_SECTORS[sid];
        var trusted = articles.filter(function(a) { return a.is_trusted; });
        var display = trusted.length > 0 ? trusted : articles;
        display = display.slice(0, 8);

        html += '<div class="news-summary-card" style="border-left-color: ' + sec.colour + '">';
        html += '<div class="news-summary-card__title">' +
                '<span style="color: ' + sec.colour + '">' + escapeHtml(sec.label) + '</span>' +
                '<span class="news-summary-card__count">' + articles.length + ' articles</span>' +
                '</div>';
        html += '<ul class="news-summary-card__list">';
        for (var i = 0; i < display.length; i++) {
            var a = display[i];
            html += '<li>';
            if (a.url) html += '<a href="' + escapeHtml(a.url) + '" target="_blank" rel="noopener">';
            html += escapeHtml(a.title);
            if (a.url) html += '</a>';
            html += ' <span style="color:#999; font-size:10px">' + escapeHtml(a.source || '') + '</span>';
            html += '</li>';
        }
        html += '</ul></div>';
    }

    el.innerHTML = html;
}

function renderNewsCards() {
    var el = document.getElementById('news-grid');
    if (!el) return;

    var allArticles = [];
    for (var sid in APP.news.articles) {
        var filtered = _filteredArticles(sid);
        for (var i = 0; i < filtered.length; i++) {
            filtered[i]._sector = sid;
            allArticles.push(filtered[i]);
        }
    }

    // Sort newest first
    allArticles.sort(function(a, b) {
        return (b.published_at || '').localeCompare(a.published_at || '');
    });

    var html = '';
    for (var j = 0; j < allArticles.length; j++) {
        var a = allArticles[j];
        var sec = NEWS_SECTORS[a._sector] || { label: a._sector, colour: '#666' };

        html += '<article class="news-card">';

        // Title
        html += '<div class="news-card__title">';
        if (a.url) html += '<a href="' + escapeHtml(a.url) + '" target="_blank" rel="noopener">';
        html += escapeHtml(a.title);
        if (a.url) html += '</a>';
        html += '</div>';

        // Meta
        html += '<div class="news-card__meta">';
        html += '<span class="news-sector-badge" style="background:' + sec.colour + '15;color:' + sec.colour + '">' + escapeHtml(sec.label) + '</span>';
        if (a.source) html += '<span>' + escapeHtml(a.source) + '</span>';
        if (a.date_display) html += '<span>' + escapeHtml(a.date_display) + '</span>';
        if (a.sentiment) html += '<span class="news-sentiment news-sentiment--' + a.sentiment + '" title="' + a.sentiment + '"></span>';
        if (a.is_trusted) html += '<span class="news-trusted-badge">Trusted</span>';
        html += '</div>';

        // Description
        if (a.description) {
            html += '<div class="news-card__desc">' + escapeHtml(a.description) + '</div>';
        }

        html += '</article>';
    }

    if (html === '') {
        document.getElementById('news-empty-state').classList.remove('hidden');
    } else {
        document.getElementById('news-empty-state').classList.add('hidden');
    }

    el.innerHTML = html;
}

// ================================================================
// Filtering
// ================================================================

function _filteredArticles(sectorId) {
    if (APP.news.activeSector !== 'all' && sectorId !== APP.news.activeSector) return [];
    var articles = APP.news.articles[sectorId] || [];
    var now = new Date();
    var cutoff = new Date(now.getTime() - APP.news.activeDays * 24 * 60 * 60 * 1000);
    var search = APP.news.searchText.toLowerCase();

    return articles.filter(function(a) {
        // Date filter
        if (a.published_at) {
            var d = new Date(a.published_at);
            if (d < cutoff) return false;
        }
        // Search filter
        if (search) {
            var text = ((a.title || '') + ' ' + (a.source || '') + ' ' + (a.description || '')).toLowerCase();
            if (text.indexOf(search) === -1) return false;
        }
        return true;
    });
}

function applyNewsFilters() {
    if (APP.news.activeView === 'summary') {
        document.getElementById('news-summaries').classList.remove('hidden');
        document.getElementById('news-grid').classList.add('hidden');
        renderNewsSummaries();
    } else {
        document.getElementById('news-summaries').classList.add('hidden');
        document.getElementById('news-grid').classList.remove('hidden');
        renderNewsCards();
    }
}

// Global handlers (called from onclick)
window.filterNewsSector = function(sector) {
    APP.news.activeSector = sector;
    var btns = document.querySelectorAll('.news-controls .filter-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-sector') === sector);
    }
    applyNewsFilters();
};

window.searchNews = function(text) {
    APP.news.searchText = text;
    applyNewsFilters();
};

window.filterNewsDays = function(days) {
    APP.news.activeDays = days;
    var btns = document.querySelectorAll('.news-date-filter button');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', parseInt(btns[i].textContent) === days);
    }
    applyNewsFilters();
};

window.toggleNewsView = function(view) {
    APP.news.activeView = view;
    var btns = document.querySelectorAll('.news-view-toggle button');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].textContent.toLowerCase() === view);
    }
    applyNewsFilters();
};

// Export loadNews to global scope for router
window.loadNews = loadNews;

})();
