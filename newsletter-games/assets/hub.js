/* ==========================================================================
   KPMG Minigames — Hub Controller (SPA)
   Main controller for the games hub: routing, game cards, auth integration.
   ========================================================================== */

/** Game icon mapping by game ID */
const GAME_ICONS = {
    'consultant-rush': '\u{1F95A}',
    'audit-ascent': '\u{1F680}',
    'flappy-brief': '\u{1F4BC}',
    'deal-spell': '\u{1F4DD}',
    'tax-tetris': '\u{1F9F1}',
    'slide-deck-stacker': '\u{1F4CA}',
    'budget-blitz': '\u{1F4B0}',
    'merger-match': '\u{1F0CF}',
    'risk-radar': '\u{1F6E1}\uFE0F',
    'pipeline-plumber': '\u{1F527}',
    'kpi-catcher': '\u{1F4C8}',
    'strategy-snake': '\u{1F40D}'
};

/** Maximum attempts per game per edition */
const MAX_ATTEMPTS = 3;

/** API base URL */
const API_BASE = '/api';

const Hub = {
    currentView: 'games',
    currentEdition: null,
    games: [],
    userAttempts: {},  // { gameId: { used: N, remaining: N, bestScore: N } }
    _toastTimer: null,

    /* ------------------------------------------------------------------
       Initialisation
       ------------------------------------------------------------------ */

    /** True when running on static hosting (no API backend) */
    staticMode: false,

    /** All 12 game definitions for static/demo mode */
    STATIC_GAMES: [
        { id: 'consultant-rush', title: 'Easter Egg Rush', description: 'Hop through the spring meadow collecting Easter eggs and dodging obstacles' },
        { id: 'audit-ascent', title: 'Audit Ascent', description: 'Climb the corporate ladder collecting audit evidence' },
        { id: 'flappy-brief', title: 'Flappy Brief', description: 'Navigate your briefing through bureaucratic hurdles' },
        { id: 'deal-spell', title: 'Deal Spell', description: 'Spell out deal terms before time runs out' },
        { id: 'tax-tetris', title: 'Tax Tetris', description: 'Stack tax deductions into perfect returns' },
        { id: 'slide-deck-stacker', title: 'Slide Deck Stacker', description: 'Build the tallest presentation deck' },
        { id: 'budget-blitz', title: 'Budget Blitz', description: 'Allocate the budget before the deadline hits' },
        { id: 'merger-match', title: 'Merger Match', description: 'Match companies for the perfect acquisition' },
        { id: 'risk-radar', title: 'Risk Radar', description: 'Detect and neutralise risks on the radar' },
        { id: 'pipeline-plumber', title: 'Pipeline Plumber', description: 'Connect the deal pipeline before it leaks' },
        { id: 'kpi-catcher', title: 'KPI Catcher', description: 'Catch the right KPIs and dodge the vanity metrics' },
        { id: 'strategy-snake', title: 'Strategy Snake', description: 'Grow your strategy by collecting insights' }
    ],

    async init() {
        // 0. Detect static hosting — probe the API
        try {
            var probe = await fetch('/api/editions/current');
            if (!probe.ok) throw new Error('API unavailable');
        } catch (_) {
            this.staticMode = true;
        }

        if (this.staticMode) {
            // Static/demo mode — skip auth, show all games immediately
            this._initStaticMode();
            return;
        }

        // 1. Set up Auth callback
        Auth.onAuthChange = (user) => this.onAuthChange(user);
        Auth.init();

        // 2. Set up nav buttons
        var navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => this.navigate(btn.dataset.view));
        });
        // Add tablist role to nav container
        if (navBtns.length > 0 && navBtns[0].parentElement) {
            navBtns[0].parentElement.setAttribute('role', 'tablist');
        }

        // 3. Set up login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // 4. Hash routing
        window.addEventListener('hashchange', () => this.handleHash());
        this.handleHash();
    },

    /**
     * Initialise static mode — no auth, no API. Fetch the edition config
     * from assets/edition.json to determine the featured game and per-player
     * attempt cap (tracked in localStorage). Falls back to "all games unlimited"
     * if the config is missing, so a broken deploy still renders something.
     */
    _initStaticMode() {
        // Hide login view, show games view
        document.querySelectorAll('.view').forEach(function(v) { v.style.display = 'none'; });
        var gamesView = document.getElementById('view-games');
        if (gamesView) gamesView.style.display = 'block';

        // Hide leaderboard nav button (no API to fetch scores)
        var lbBtn = document.querySelector('.nav-btn[data-view="leaderboard"]');
        if (lbBtn) lbBtn.style.display = 'none';

        // No auth in static mode — leave the user area blank
        var userArea = document.getElementById('user-area');
        if (userArea) userArea.innerHTML = '';

        var self = this;
        return fetch('assets/edition.json', { cache: 'no-cache' })
            .then(function(res) {
                if (!res.ok) throw new Error('edition.json HTTP ' + res.status);
                return res.json();
            })
            .then(function(edition) {
                if (!edition || !edition.slug || !edition.featuredGameId) {
                    throw new Error('edition.json missing slug or featuredGameId');
                }

                // Map edition.json shape onto the in-app currentEdition shape so
                // renderEditionBanner / renderGamesGrid (used by the API path)
                // work unchanged.
                self.currentEdition = {
                    id: edition.slug,
                    name: edition.displayName || ('Edition ' + edition.slug),
                    closes_at: edition.closesAt || null
                };
                var maxAttempts = edition.maxAttempts || MAX_ATTEMPTS;

                // Filter to the single featured game
                var featured = self.STATIC_GAMES.filter(function(g) { return g.id === edition.featuredGameId; });
                if (featured.length === 0) {
                    throw new Error('featuredGameId "' + edition.featuredGameId + '" not in STATIC_GAMES');
                }
                self.games = featured;

                // Populate userAttempts from localStorage
                self.userAttempts = {};
                featured.forEach(function(game) {
                    var used = self._loadStaticAttempts(edition.slug, game.id);
                    var bestScore = self._loadStaticBestScore(edition.slug, game.id);
                    self.userAttempts[game.id] = {
                        used: used,
                        remaining: Math.max(0, maxAttempts - used),
                        bestScore: bestScore
                    };
                });

                self.renderEditionBanner();
                self.renderGamesGrid();
            })
            .catch(function(err) {
                console.error('[Hub] Failed to load edition config; rendering all games as fallback:', err);
                var banner = document.getElementById('edition-banner');
                if (banner) banner.innerHTML = '<span class="edition-name">Newsletter Games</span>';
                self.games = self.STATIC_GAMES;
                self.userAttempts = {};
                self._renderAllGamesGrid();
            });
    },

    /** Read attempts used for (slug, gameId) from localStorage. Returns 0 on missing/invalid. */
    _loadStaticAttempts: function(slug, gameId) {
        try {
            var raw = localStorage.getItem('mg_attempts_' + slug + '_' + gameId);
            if (!raw) return 0;
            var n = parseInt(raw, 10);
            return (isNaN(n) || n < 0) ? 0 : n;
        } catch (_) {
            return 0;
        }
    },

    /** Read best score for (slug, gameId) from localStorage. Returns null on missing/invalid. */
    _loadStaticBestScore: function(slug, gameId) {
        try {
            var raw = localStorage.getItem('mg_best_' + slug + '_' + gameId);
            if (!raw) return null;
            var n = parseInt(raw, 10);
            return isNaN(n) ? null : n;
        } catch (_) {
            return null;
        }
    },

    /** Fallback renderer for when edition.json is missing — shows all 12 games, no attempt cap. */
    _renderAllGamesGrid: function() {
        var grid = document.getElementById('games-grid');
        if (!grid) return;

        var html = '';
        for (var i = 0; i < this.games.length; i++) {
            var game = this.games[i];
            var icon = GAME_ICONS[game.id] || '\u{1F3AE}';
            var title = this._escapeHtml(game.title);
            var desc = this._escapeHtml(game.description);
            var playUrl = 'games/' + encodeURIComponent(game.id) + '/';

            html +=
                '<div class="game-card" data-game-id="' + this._escapeHtml(game.id) + '">' +
                    '<div class="game-card-body">' +
                        '<div class="game-card-icon" aria-hidden="true">' + icon + '</div>' +
                        '<div class="game-card-title">' + title + '</div>' +
                        '<div class="game-card-desc">' + desc + '</div>' +
                    '</div>' +
                    '<div class="game-card-action">' +
                        '<a href="' + playUrl + '" class="btn-play">Play</a>' +
                    '</div>' +
                '</div>';
        }

        grid.innerHTML = html;
        this._animateCards();
    },

    /* ------------------------------------------------------------------
       Auth State
       ------------------------------------------------------------------ */

    onAuthChange(user) {
        this.renderUserArea(user);

        if (user) {
            // Logged in — load data and show games
            this.loadData().then(() => {
                if (this.currentView === 'login') {
                    this.navigate('games');
                }
            }).catch((err) => {
                this.showToast('Failed to load game data. Please try again.', 'error');
                console.error('[Hub] loadData error:', err);
            });
        } else {
            // Not logged in — show login view
            this.showLogin();
        }
    },

    /* ------------------------------------------------------------------
       Navigation / Routing
       ------------------------------------------------------------------ */

    navigate(view) {
        var validViews = ['games', 'leaderboard'];
        if (validViews.indexOf(view) === -1) {
            view = 'games';
        }

        // Must be logged in for main views
        if (!Auth.isLoggedIn()) {
            this.showLogin();
            return;
        }

        this.currentView = view;

        // Hide all views
        document.querySelectorAll('.view').forEach(function(v) {
            v.style.display = 'none';
        });

        // Show target view
        var targetEl = document.getElementById('view-' + view);
        if (targetEl) {
            targetEl.style.display = 'block';
        }

        // Update nav button active states
        document.querySelectorAll('.nav-btn').forEach(function(btn) {
            var isActive = btn.dataset.view === view;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Update hash without triggering hashchange loop
        var newHash = '#' + view;
        if (window.location.hash !== newHash) {
            history.replaceState(null, '', newHash);
        }

        // View-specific actions
        if (view === 'leaderboard' && typeof Leaderboard !== 'undefined') {
            Leaderboard.activate(this.currentEdition);
        }
    },

    showLogin() {
        this.currentView = 'login';

        document.querySelectorAll('.view').forEach(function(v) {
            v.style.display = 'none';
        });

        var loginEl = document.getElementById('view-login');
        if (loginEl) {
            loginEl.style.display = 'block';
        }

        // Clear nav active states
        document.querySelectorAll('.nav-btn').forEach(function(btn) {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        history.replaceState(null, '', '#login');
    },

    handleHash() {
        var hash = window.location.hash.slice(1) || 'games';

        if (hash === 'login' || !Auth.isLoggedIn()) {
            this.showLogin();
        } else if (hash === 'leaderboard') {
            this.navigate('leaderboard');
        } else {
            this.navigate('games');
        }
    },

    /* ------------------------------------------------------------------
       Data Loading
       ------------------------------------------------------------------ */

    async loadData() {
        // Fetch current edition
        var editionRes = await this._fetch(API_BASE + '/editions/current');
        this.currentEdition = editionRes;

        // Fetch games list
        var gamesRes = await this._fetch(API_BASE + '/games');
        this.games = gamesRes || [];

        // Fetch user attempts for each game in the current edition
        this.userAttempts = {};
        if (this.currentEdition && this.currentEdition.id && this.games.length > 0) {
            var editionId = this.currentEdition.id;
            var attemptPromises = this.games.map(function(game) {
                return Hub._fetch(
                    API_BASE + '/attempts?game_id=' + encodeURIComponent(game.id) +
                    '&edition_id=' + encodeURIComponent(editionId)
                ).then(function(data) {
                    return { gameId: game.id, data: data };
                }).catch(function() {
                    return { gameId: game.id, data: { used: 0, remaining: MAX_ATTEMPTS, bestScore: null } };
                });
            });

            var results = await Promise.all(attemptPromises);
            results.forEach(function(result) {
                var d = result.data;
                Hub.userAttempts[result.gameId] = {
                    used: d.used != null ? d.used : 0,
                    remaining: d.remaining != null ? d.remaining : MAX_ATTEMPTS,
                    bestScore: d.best_score != null ? d.best_score : null
                };
            });
        }

        // Render
        this.renderEditionBanner();
        this.renderGamesGrid();
    },

    /* ------------------------------------------------------------------
       Rendering — Edition Banner
       ------------------------------------------------------------------ */

    renderEditionBanner() {
        var banner = document.getElementById('edition-banner');
        if (!banner) return;

        if (!this.currentEdition) {
            banner.innerHTML = '<span class="edition-name">No active edition</span>';
            return;
        }

        var name = this._escapeHtml(this.currentEdition.name || this.currentEdition.title || 'Current Edition');
        var closesDate = this.currentEdition.closes_at || this.currentEdition.end_date || null;
        var closesHtml = '';

        if (closesDate) {
            var formatted = this._formatDate(closesDate);
            closesHtml = '<span class="edition-closes">Closes ' + formatted + '</span>';
        }

        banner.innerHTML =
            '<span class="edition-name">' + name + '</span>' +
            closesHtml;
    },

    /* ------------------------------------------------------------------
       Rendering — Games Grid
       ------------------------------------------------------------------ */

    renderGamesGrid() {
        var grid = document.getElementById('games-grid');
        if (!grid) return;

        if (this.games.length === 0) {
            grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#666666;padding:40px 0;">No games available in this edition.</p>';
            return;
        }

        // Featured game banner when single game per edition
        var featuredHtml = '';
        if (this.games.length === 1) {
            featuredHtml = '<div style="grid-column:1/-1;text-align:center;padding:12px 0 4px;">' +
                '<span style="background:#00338D;color:#fff;padding:4px 16px;border-radius:4px;font-size:13px;font-weight:700;letter-spacing:0.5px;">' +
                'THIS MONTH\'S FEATURED GAME</span></div>';
        }

        var editionId = this.currentEdition ? this.currentEdition.id : '';
        var html = '';

        for (var i = 0; i < this.games.length; i++) {
            var game = this.games[i];
            var icon = GAME_ICONS[game.id] || '\u{1F3AE}';
            var title = this._escapeHtml(game.title || game.name || game.id);
            var desc = this._escapeHtml(game.description || '');
            var attempts = this.userAttempts[game.id] || { used: 0, remaining: MAX_ATTEMPTS, bestScore: null };

            // Attempt dots
            var dotsHtml = '<div class="attempt-dots" aria-label="' + attempts.used + ' of ' + MAX_ATTEMPTS + ' attempts used">';
            for (var d = 0; d < MAX_ATTEMPTS; d++) {
                var usedClass = d < attempts.used ? ' used' : '';
                dotsHtml += '<span class="attempt-dot' + usedClass + '" aria-hidden="true"></span>';
            }
            dotsHtml += '</div>';

            // Best score badge
            var scoreHtml;
            if (attempts.bestScore !== null && attempts.bestScore !== undefined) {
                scoreHtml = '<span class="best-score">Best: ' + this._formatScore(attempts.bestScore) + '</span>';
            } else {
                scoreHtml = '<span class="best-score empty">--</span>';
            }

            // Play button
            var isCompleted = attempts.remaining <= 0;
            // Static mode: relative URL (gh-pages mounts at /newsletter-games/, no API edition param).
            // API mode: absolute URL with edition query param so the game can validate edition match.
            var playUrl = this.staticMode
                ? 'games/' + encodeURIComponent(game.id) + '/'
                : '/games/' + encodeURIComponent(game.id) + '/?edition=' + encodeURIComponent(editionId);
            var btnHtml;
            if (isCompleted) {
                btnHtml = '<span class="btn-play completed">Completed</span>';
            } else {
                btnHtml = '<a href="' + playUrl + '" class="btn-play">Play</a>';
            }

            html +=
                '<div class="game-card" data-game-id="' + this._escapeHtml(game.id) + '">' +
                    '<div class="game-card-body">' +
                        '<div class="game-card-icon" aria-hidden="true">' + icon + '</div>' +
                        '<div class="game-card-title">' + title + '</div>' +
                        '<div class="game-card-desc">' + desc + '</div>' +
                    '</div>' +
                    '<div class="game-card-meta">' +
                        dotsHtml +
                        scoreHtml +
                    '</div>' +
                    '<div class="game-card-action">' +
                        btnHtml +
                    '</div>' +
                '</div>';
        }

        grid.innerHTML = featuredHtml + html;

        // GSAP entrance animation (if available)
        this._animateCards();
    },

    /* ------------------------------------------------------------------
       Rendering — User Area
       ------------------------------------------------------------------ */

    renderUserArea(user) {
        var area = document.getElementById('user-area');
        if (!area) return;

        if (user) {
            var initial = (user.display_name || user.email || '?').charAt(0).toUpperCase();
            var email = this._escapeHtml(user.email || '');

            area.innerHTML =
                '<span class="user-avatar" aria-hidden="true" style="' +
                    'display:inline-flex;align-items:center;justify-content:center;' +
                    'width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.2);' +
                    'color:#fff;font-size:13px;font-weight:700;flex-shrink:0;' +
                '">' + initial + '</span>' +
                '<span class="user-email">' + email + '</span>' +
                '<button class="btn-logout" type="button">Sign Out</button>';

            // Bind logout
            var logoutBtn = area.querySelector('.btn-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', function() {
                    Auth.logout();
                });
            }
        } else {
            area.innerHTML =
                '<button class="btn-login-header" type="button">Sign In</button>';

            var loginBtn = area.querySelector('.btn-login-header');
            if (loginBtn) {
                loginBtn.addEventListener('click', function() {
                    Hub.showLogin();
                });
            }
        }
    },

    /* ------------------------------------------------------------------
       Login Handler
       ------------------------------------------------------------------ */

    async handleLogin() {
        var emailInput = document.getElementById('login-email');
        var nameInput = document.getElementById('login-name');
        var submitBtn = document.querySelector('#login-form .btn-primary');

        if (!emailInput || !nameInput) return;

        var email = emailInput.value.trim();
        var name = nameInput.value.trim();

        if (!email || !name) {
            this.showLoginError('Please enter both your email and display name.');
            return;
        }

        // Disable button during request
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in\u2026';
        }
        this.hideLoginError();

        try {
            await Auth.register(email, name);
            // Auth.onAuthChange will fire, which calls loadData + navigate
        } catch (err) {
            this.showLoginError(err.message || 'Login failed. Please try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Start Playing';
            }
        }
    },

    showLoginError(msg) {
        var errEl = document.querySelector('.login-error');
        if (!errEl) {
            // Create error element if it doesn't exist
            var form = document.getElementById('login-form');
            if (!form) return;
            errEl = document.createElement('p');
            errEl.className = 'login-error';
            form.appendChild(errEl);
        }
        errEl.textContent = msg;
        errEl.classList.add('visible');
    },

    hideLoginError() {
        var errEl = document.querySelector('.login-error');
        if (errEl) {
            errEl.classList.remove('visible');
            errEl.textContent = '';
        }
    },

    /* ------------------------------------------------------------------
       GSAP Card Animation
       ------------------------------------------------------------------ */

    _animateCards() {
        if (typeof gsap === 'undefined') return;

        // Check for reduced motion preference
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        var cards = document.querySelectorAll('.game-card');
        if (cards.length === 0) return;

        gsap.fromTo(cards,
            { opacity: 0, y: 24 },
            {
                opacity: 1,
                y: 0,
                duration: 0.35,
                stagger: 0.06,
                ease: 'power2.out',
                clearProps: 'all'
            }
        );
    },

    /* ------------------------------------------------------------------
       Toast Notifications
       ------------------------------------------------------------------ */

    showToast(message, type) {
        type = type || 'info';

        // Remove existing toast
        var existing = document.querySelector('.hub-toast');
        if (existing) {
            existing.remove();
        }

        if (this._toastTimer) {
            clearTimeout(this._toastTimer);
            this._toastTimer = null;
        }

        var bgColour = type === 'error' ? '#ED2124' : '#00338D';
        var toast = document.createElement('div');
        toast.className = 'hub-toast';
        toast.setAttribute('role', 'alert');
        toast.style.cssText =
            'position:fixed;top:68px;left:50%;transform:translateX(-50%);' +
            'background:' + bgColour + ';color:#fff;padding:10px 24px;' +
            'border-radius:4px;font-size:14px;font-family:Arial,Helvetica,sans-serif;' +
            'z-index:2000;box-shadow:0 2px 8px rgba(0,0,0,0.2);max-width:90vw;text-align:center;';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Auto-dismiss
        this._toastTimer = setTimeout(function() {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    },

    /* ------------------------------------------------------------------
       Utility Helpers
       ------------------------------------------------------------------ */

    /**
     * Authenticated fetch wrapper with error handling.
     * @param {string} url
     * @param {Object} [options]
     * @returns {Promise<Object>} Parsed JSON response
     */
    async _fetch(url, options) {
        options = options || {};
        if (!options.headers) {
            options.headers = Auth.getHeaders();
        }

        var res;
        try {
            res = await fetch(url, options);
        } catch (err) {
            throw new Error('Network error \u2014 please check your connection.');
        }

        if (res.status === 401) {
            Auth.logout();
            throw new Error('Session expired \u2014 please log in again.');
        }

        if (!res.ok) {
            var body;
            try {
                body = await res.json();
            } catch (_) {
                body = {};
            }
            throw new Error(body.message || 'Request failed (HTTP ' + res.status + ')');
        }

        // Handle 204 No Content
        if (res.status === 204) {
            return {};
        }

        return res.json();
    },

    /**
     * Escape HTML special characters.
     * @param {string} str
     * @returns {string}
     */
    _escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    },

    /**
     * Format an ISO date string to a readable format.
     * @param {string} dateStr
     * @returns {string}
     */
    _formatDate(dateStr) {
        try {
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
        } catch (_) {
            return dateStr;
        }
    },

    /**
     * Format a score number with commas.
     * @param {number} score
     * @returns {string}
     */
    _formatScore(score) {
        if (score === null || score === undefined) return '--';
        return Number(score).toLocaleString();
    }
};

/* --- Bootstrap --- */
document.addEventListener('DOMContentLoaded', function() {
    Hub.init();
});
