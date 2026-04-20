/**
 * Merger Match — Memory card matching game (DOM-based)
 * Match company/sector pairs across escalating grid levels.
 */
(function () {
    'use strict';

    const GAME_ID = 'merger-match';
    const MAX_TIME = 180; // 3 minutes total

    // All possible sector pairs
    const ALL_PAIRS = [
        { name: 'Tech & AI', abbr: 'T&A' },
        { name: 'Health & Pharma', abbr: 'H&P' },
        { name: 'Energy & Mining', abbr: 'E&M' },
        { name: 'Finance & Banking', abbr: 'F&B' },
        { name: 'Retail & FMCG', abbr: 'R&F' },
        { name: 'Defence & Gov', abbr: 'D&G' },
        { name: 'Telecom & Media', abbr: 'T&M' },
        { name: 'Property & Infra', abbr: 'P&I' },
        { name: 'Transport & Logistics', abbr: 'T&L' },
        { name: 'Education & Research', abbr: 'E&R' },
        { name: 'Agriculture & Food', abbr: 'A&F' },
        { name: 'Insurance & Super', abbr: 'I&S' }
    ];

    // Level configs: [cols, rows, numPairs]
    const LEVELS = [
        { cols: 4, rows: 4, pairs: 8, label: 'Level 1 \u2014 4\u00D74' },
        { cols: 5, rows: 4, pairs: 10, label: 'Level 2 \u2014 4\u00D75' },
        { cols: 6, rows: 4, pairs: 12, label: 'Level 3 \u2014 6\u00D74' }
    ];

    // State
    let currentLevel = 0;
    let totalScore = 0;
    let totalFlips = 0;
    let matchesThisLevel = 0;
    let pairsThisLevel = 0;
    let flippedCards = [];
    let lockBoard = false;
    let startTime = 0;
    let timerInterval = null;
    let gameActive = false;
    let levelStartTime = 0;

    // DOM refs (resolved at init time)
    let gridEl, hudScore, hudMatches, hudFlips, hudTimer, levelBanner;

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getPairColor(index) {
        return KPMG.colours.palette[index % KPMG.colours.palette.length];
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function reset() {
        currentLevel = 0;
        totalScore = 0;
        totalFlips = 0;
        matchesThisLevel = 0;
        pairsThisLevel = 0;
        flippedCards = [];
        lockBoard = false;
        gameActive = false;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (gridEl) gridEl.innerHTML = '';
    }

    function updateHUD() {
        hudScore.textContent = 'Score: ' + totalScore;
        hudMatches.textContent = 'Matches: ' + matchesThisLevel + '/' + pairsThisLevel;
        hudFlips.textContent = 'Flips: ' + totalFlips;

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        hudTimer.textContent = formatTime(elapsed);
    }

    function buildLevel(levelIndex) {
        const level = LEVELS[levelIndex];
        const { cols, rows, pairs } = level;
        pairsThisLevel = pairs;
        matchesThisLevel = 0;
        flippedCards = [];
        lockBoard = false;

        levelBanner.textContent = level.label;
        levelBanner.classList.add('active');
        setTimeout(() => levelBanner.classList.remove('active'), 1500);

        gridEl.className = 'card-grid cols-' + cols;
        gridEl.innerHTML = '';

        const levelPairs = ALL_PAIRS.slice(0, pairs);
        const cards = [];
        levelPairs.forEach((pair, idx) => {
            cards.push({ pairId: idx, ...pair });
            cards.push({ pairId: idx, ...pair });
        });
        shuffle(cards);

        levelStartTime = Date.now();

        cards.forEach((cardData, i) => {
            const cell = document.createElement('div');
            cell.className = 'card-cell';
            cell.dataset.index = i;
            cell.dataset.pairId = cardData.pairId;

            const inner = document.createElement('div');
            inner.className = 'card-inner';

            const back = document.createElement('div');
            back.className = 'card-face card-back';
            back.textContent = '?';

            const front = document.createElement('div');
            front.className = 'card-face card-front';

            const icon = document.createElement('div');
            icon.className = 'card-icon';
            icon.style.background = getPairColor(cardData.pairId);
            icon.textContent = cardData.abbr;

            const label = document.createElement('div');
            label.className = 'card-label';
            label.textContent = cardData.name;

            front.appendChild(icon);
            front.appendChild(label);

            inner.appendChild(back);
            inner.appendChild(front);
            cell.appendChild(inner);

            cell.addEventListener('click', () => onCardClick(cell));

            gridEl.appendChild(cell);
        });

        updateHUD();
    }

    function onCardClick(cell) {
        if (!gameActive || lockBoard) return;
        if (cell.classList.contains('flipped') || cell.classList.contains('matched')) return;
        if (flippedCards.length >= 2) return;

        cell.classList.add('flipped');
        flippedCards.push(cell);
        totalFlips++;
        updateHUD();

        if (flippedCards.length === 2) {
            lockBoard = true;
            const [card1, card2] = flippedCards;

            if (card1.dataset.pairId === card2.dataset.pairId) {
                setTimeout(() => {
                    card1.classList.add('matched');
                    card2.classList.add('matched');
                    matchesThisLevel++;
                    totalScore += 200;
                    updateHUD();

                    flippedCards = [];
                    lockBoard = false;

                    if (matchesThisLevel >= pairsThisLevel) {
                        onLevelComplete();
                    }
                }, 300);
            } else {
                card1.classList.add('wrong');
                card2.classList.add('wrong');
                totalScore = Math.max(0, totalScore - 10);

                setTimeout(() => {
                    card1.classList.remove('flipped', 'wrong');
                    card2.classList.remove('flipped', 'wrong');
                    flippedCards = [];
                    lockBoard = false;
                    updateHUD();
                }, 800);
            }
        }
    }

    function onLevelComplete() {
        const levelElapsed = Math.floor((Date.now() - levelStartTime) / 1000);
        const speedBonus = Math.max(0, 2000 - levelElapsed * 10);
        totalScore += speedBonus;
        updateHUD();

        if (currentLevel < LEVELS.length - 1) {
            currentLevel++;
            setTimeout(() => buildLevel(currentLevel), 800);
        } else {
            setTimeout(() => endGame(), 500);
        }
    }

    function endGame() {
        if (!gameActive) return; // guard against double call (timer + level-complete race)
        gameActive = false;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        GameEngine.state.score = totalScore;
        GameEngine.endGame();
    }

    function checkTimer() {
        if (!gameActive) return;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        updateHUD();
        if (elapsed >= MAX_TIME) {
            endGame();
        }
    }

    // --- Init ---
    function init() {
        // Resolve DOM refs
        gridEl = document.getElementById('card-grid');
        hudScore = document.getElementById('hud-score');
        hudMatches = document.getElementById('hud-matches');
        hudFlips = document.getElementById('hud-flips');
        hudTimer = document.getElementById('hud-timer');
        levelBanner = document.getElementById('level-banner');

        // DOM-based game, set up overlay manually
        const container = document.getElementById('game-container');
        GameEngine._ensureOverlayContainer(container);
        GameEngine._logicalWidth = 480;
        GameEngine._logicalHeight = 700;

        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'HOW TO PLAY',
                objective: 'Flip cards and match company pairs from memory. Clear all pairs to advance to larger grids. You have 3 minutes.',
                controls: [
                    'Click or tap cards to flip them',
                    'Match two identical cards to clear them'
                ],
                tip: 'Try to remember card positions — the grid gets bigger each level!'
            },
            onUpdate: function () {},
            onDraw: function () {},
            onGameOver: function () {
                gameActive = false;
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
            },
            onReset: function () {
                reset();
            },
            onInit: function () {
                reset();

                // No need to cancel game loop — engine skips it for DOM-based games (no canvas)

                // Build the grid behind the countdown overlay but defer gameActive
                buildLevel(0);
            },
            onCountdownComplete: function () {
                gameActive = true;
                startTime = Date.now();
                timerInterval = setInterval(checkTimer, 250);
            }
        });
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
