/* ==========================================================================
   KPMG Minigames — Leaderboard Module (ECharts)
   ECharts-based leaderboard with edition filtering and all-time view.
   ========================================================================== */

/** KPMG brand palette — 8 colours in mandatory order */
var KPMG_PALETTE = [
    '#00338D', '#00B8F5', '#1E49E2', '#76D2FF',
    '#7213EA', '#B497FF', '#00C0AE', '#AB0D82'
];

/** API base URL */
var LB_API_BASE = '/api';

var Leaderboard = {
    chart: null,
    currentEditionId: null,
    allTime: false,
    editions: [],
    _initialised: false,

    /* ------------------------------------------------------------------
       Initialisation
       ------------------------------------------------------------------ */

    init() {
        if (this._initialised) return;
        this._initialised = true;

        // Register ECharts KPMG theme
        this.registerTheme();

        // Edition selector
        var editionSelect = document.getElementById('edition-select');
        if (editionSelect) {
            editionSelect.addEventListener('change', function(e) {
                Leaderboard.currentEditionId = e.target.value;
                Leaderboard.allTime = false;
                Leaderboard._updateAllTimeButton(false);
                Leaderboard.load();
            });
        }

        // All-time button
        var allTimeBtn = document.getElementById('btn-alltime');
        if (allTimeBtn) {
            allTimeBtn.addEventListener('click', function() {
                Leaderboard.allTime = true;
                Leaderboard._updateAllTimeButton(true);
                Leaderboard.load();
            });
        }

        // Resize handler for chart responsiveness
        window.addEventListener('resize', function() {
            if (Leaderboard.chart) {
                Leaderboard.chart.resize();
            }
        });
    },

    /* ------------------------------------------------------------------
       ECharts Theme Registration
       ------------------------------------------------------------------ */

    registerTheme() {
        if (typeof echarts === 'undefined') {
            console.warn('[Leaderboard] ECharts not loaded \u2014 chart will not render.');
            return;
        }

        echarts.registerTheme('kpmg', {
            color: KPMG_PALETTE,
            backgroundColor: '#FFFFFF',
            textStyle: {
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: '#333333'
            },
            title: {
                textStyle: {
                    color: '#00338D',
                    fontWeight: 'bold',
                    fontFamily: 'Arial, Helvetica, sans-serif'
                },
                subtextStyle: {
                    color: '#666666',
                    fontFamily: 'Arial, Helvetica, sans-serif'
                }
            },
            categoryAxis: {
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                axisTick: { lineStyle: { color: '#E5E5E5' } },
                axisLabel: { color: '#333333' },
                splitLine: { lineStyle: { color: '#E5E5E5', type: 'dashed' } }
            },
            valueAxis: {
                axisLine: { lineStyle: { color: '#E5E5E5' } },
                axisTick: { lineStyle: { color: '#E5E5E5' } },
                axisLabel: { color: '#666666' },
                splitLine: { lineStyle: { color: '#E5E5E5', type: 'dashed' } }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                borderColor: '#E5E5E5',
                borderWidth: 1,
                textStyle: {
                    color: '#333333',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: 13
                },
                extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.12);'
            }
        });
    },

    /* ------------------------------------------------------------------
       Activation (called when leaderboard view becomes visible)
       ------------------------------------------------------------------ */

    activate(currentEdition) {
        this.init();

        if (currentEdition && currentEdition.id) {
            this.currentEditionId = currentEdition.id;
        }

        this.loadEditions().then(function() {
            Leaderboard.load();
        }).catch(function(err) {
            console.error('[Leaderboard] Failed to load editions:', err);
            Leaderboard.load();
        });
    },

    /* ------------------------------------------------------------------
       Data Loading
       ------------------------------------------------------------------ */

    async loadEditions() {
        var select = document.getElementById('edition-select');
        if (!select) return;

        try {
            var data = await this._fetch(LB_API_BASE + '/editions');
            this.editions = data || [];
        } catch (err) {
            console.error('[Leaderboard] editions fetch error:', err);
            this.editions = [];
        }

        // Populate dropdown
        select.innerHTML = '';

        if (this.editions.length === 0) {
            var opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No editions available';
            select.appendChild(opt);
            return;
        }

        for (var i = 0; i < this.editions.length; i++) {
            var edition = this.editions[i];
            var option = document.createElement('option');
            option.value = edition.id;
            option.textContent = edition.name || edition.title || ('Edition ' + edition.id);

            // Mark active edition
            if (edition.active || edition.is_active) {
                option.textContent += ' (Current)';
            }

            select.appendChild(option);
        }

        // Select current edition
        if (this.currentEditionId) {
            select.value = this.currentEditionId;
        } else if (this.editions.length > 0) {
            // Default to first active, or just first
            var active = this.editions.find(function(e) { return e.active || e.is_active; });
            if (active) {
                select.value = active.id;
                this.currentEditionId = active.id;
            } else {
                select.value = this.editions[0].id;
                this.currentEditionId = this.editions[0].id;
            }
        }
    },

    async load() {
        var url;
        if (this.allTime) {
            url = LB_API_BASE + '/leaderboard/all-time';
        } else if (this.currentEditionId) {
            url = LB_API_BASE + '/leaderboard?edition_id=' + encodeURIComponent(this.currentEditionId);
        } else {
            url = LB_API_BASE + '/leaderboard';
        }

        try {
            var data = await this._fetch(url);
            var entries = data || [];

            this.renderChart(entries);
            this.renderTable(entries);
        } catch (err) {
            console.error('[Leaderboard] load error:', err);
            this._renderChartError();
            this._renderTableEmpty('Failed to load leaderboard data.');
        }
    },

    /* ------------------------------------------------------------------
       Chart Rendering
       ------------------------------------------------------------------ */

    renderChart(data) {
        var container = document.getElementById('leaderboard-chart');
        if (!container) return;

        if (typeof echarts === 'undefined') {
            container.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666666;font-size:14px;">' +
                'Chart library not available' +
                '</div>';
            return;
        }

        // Initialise or reuse chart instance
        if (!this.chart) {
            this.chart = echarts.init(container, 'kpmg');
        }

        if (!data || data.length === 0) {
            this.chart.clear();
            this.chart.setOption({
                title: {
                    text: 'Leaderboard',
                    subtext: this.allTime ? 'All Time' : 'Current Edition',
                    left: 'center',
                    top: 20
                },
                graphic: [{
                    type: 'text',
                    left: 'center',
                    top: 'middle',
                    style: {
                        text: 'No scores yet \u2014 be the first to play!',
                        fill: '#666666',
                        fontSize: 14,
                        fontFamily: 'Arial, Helvetica, sans-serif'
                    }
                }]
            });
            return;
        }

        // Top 10 for chart
        var top10 = data.slice(0, 10);

        // Reverse for horizontal bar (so #1 appears at top)
        var reversed = top10.slice().reverse();

        var names = reversed.map(function(entry) {
            return entry.display_name || entry.name || entry.email || 'Player';
        });

        var scores = reversed.map(function(entry) {
            return entry.total_score || entry.score || 0;
        });

        // Assign palette colours by rank position (top rank gets first colour)
        var barColours = reversed.map(function(entry, idx) {
            var rankIdx = top10.length - 1 - idx; // Original rank index (0 = best)
            return KPMG_PALETTE[rankIdx % KPMG_PALETTE.length];
        });

        var gamesPlayed = reversed.map(function(entry) {
            return entry.games_played || entry.games_count || 0;
        });

        var option = {
            title: {
                text: 'Top 10',
                subtext: this.allTime ? 'All Time' : this._getEditionName(),
                left: 16,
                top: 12
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    if (!params || params.length === 0) return '';
                    var p = params[0];
                    var originalIdx = top10.length - 1 - p.dataIndex;
                    var rank = originalIdx + 1;
                    return '<strong>#' + rank + ' ' + p.name + '</strong><br/>' +
                           'Score: <strong>' + Number(p.value).toLocaleString() + '</strong><br/>' +
                           'Games played: ' + gamesPlayed[p.dataIndex];
                }
            },
            grid: {
                left: 16,
                right: 40,
                top: 70,
                bottom: 24,
                containLabel: true
            },
            xAxis: {
                type: 'value',
                name: 'Score',
                nameLocation: 'end',
                nameTextStyle: { color: '#666666', fontSize: 12 },
                axisLabel: {
                    formatter: function(value) {
                        if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                        return value;
                    }
                }
            },
            yAxis: {
                type: 'category',
                data: names,
                axisLabel: {
                    fontSize: 12,
                    width: 120,
                    overflow: 'truncate',
                    color: '#333333'
                },
                axisTick: { show: false },
                axisLine: { show: false }
            },
            series: [{
                type: 'bar',
                data: scores.map(function(score, idx) {
                    return {
                        value: score,
                        itemStyle: { color: barColours[idx] }
                    };
                }),
                barMaxWidth: 28,
                label: {
                    show: true,
                    position: 'right',
                    formatter: function(params) {
                        return Number(params.value).toLocaleString();
                    },
                    fontSize: 12,
                    color: '#333333'
                },
                animationDuration: 600,
                animationEasing: 'cubicOut'
            }],
            animationDuration: 600,
            animationEasing: 'cubicOut'
        };

        this.chart.setOption(option, true);
    },

    _renderChartError() {
        var container = document.getElementById('leaderboard-chart');
        if (!container) return;

        if (this.chart) {
            this.chart.dispose();
        }

        container.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ED2124;font-size:14px;">' +
            'Unable to load chart data' +
            '</div>';
        this.chart = null;
    },

    /* ------------------------------------------------------------------
       Table Rendering
       ------------------------------------------------------------------ */

    renderTable(data) {
        var tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;

        if (!data || data.length === 0) {
            this._renderTableEmpty('No scores recorded yet.');
            return;
        }

        var currentUserId = (Auth.user && Auth.user.id) ? Auth.user.id : null;
        var currentUserEmail = (Auth.user && Auth.user.email) ? Auth.user.email : null;
        var html = '';

        for (var i = 0; i < data.length; i++) {
            var entry = data[i];
            var rank = i + 1;
            var name = this._escapeHtml(entry.display_name || entry.name || entry.email || 'Player');
            var gamesCount = entry.games_played || entry.games_count || 0;
            var score = entry.total_score || entry.score || 0;

            // Determine if this is the current user
            var isCurrentUser = false;
            if (currentUserId && (entry.user_id === currentUserId || entry.id === currentUserId)) {
                isCurrentUser = true;
            } else if (currentUserEmail && entry.email === currentUserEmail) {
                isCurrentUser = true;
            }

            var rowClass = isCurrentUser ? ' class="current-user"' : '';

            // Rank cell with medal styling for top 3
            var rankDisplay;
            var rankClass = 'rank-cell';
            if (rank === 1) {
                rankDisplay = '\u{1F947} 1';
                rankClass += ' gold';
            } else if (rank === 2) {
                rankDisplay = '\u{1F948} 2';
                rankClass += ' silver';
            } else if (rank === 3) {
                rankDisplay = '\u{1F949} 3';
                rankClass += ' bronze';
            } else {
                rankDisplay = String(rank);
            }

            html +=
                '<tr' + rowClass + '>' +
                    '<td class="' + rankClass + '">' + rankDisplay + '</td>' +
                    '<td>' + name + '</td>' +
                    '<td class="games-cell">' + gamesCount + '</td>' +
                    '<td class="score-cell">' + Number(score).toLocaleString() + '</td>' +
                '</tr>';
        }

        tbody.innerHTML = html;
    },

    _renderTableEmpty(message) {
        var tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;

        tbody.innerHTML =
            '<tr><td colspan="4" style="text-align:center;padding:32px 16px;color:#666666;">' +
            this._escapeHtml(message) +
            '</td></tr>';
    },

    /* ------------------------------------------------------------------
       UI Helpers
       ------------------------------------------------------------------ */

    _updateAllTimeButton(active) {
        var btn = document.getElementById('btn-alltime');
        if (!btn) return;
        btn.classList.toggle('active', active);

        // Deselect edition dropdown visual cue when all-time is active
        var select = document.getElementById('edition-select');
        if (select) {
            select.style.opacity = active ? '0.5' : '1';
        }
    },

    _getEditionName() {
        if (!this.currentEditionId || this.editions.length === 0) return '';
        var found = this.editions.find(function(e) {
            return String(e.id) === String(Leaderboard.currentEditionId);
        });
        return found ? (found.name || found.title || '') : '';
    },

    /* ------------------------------------------------------------------
       Utility Helpers
       ------------------------------------------------------------------ */

    /**
     * Authenticated fetch wrapper.
     * @param {string} url
     * @param {Object} [options]
     * @returns {Promise<Object>}
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
            throw new Error('Session expired.');
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
    }
};
