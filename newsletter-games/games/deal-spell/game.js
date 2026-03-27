/**
 * Deal Spell — KPMG Newsletter Minigame
 * Hangman-style word guessing with consulting/M&A terms.
 */
(function () {
    'use strict';

    const GAME_ID = 'deal-spell';
    const MAX_WRONG = 6;
    const DEAL_START = 100; // $100M

    const WORDS = {
        'Deals': ['EBITDA', 'SYNERGY', 'ACQUISITION', 'DIVESTITURE', 'MERGER', 'VALUATION', 'ARBITRAGE', 'LEVERAGED', 'FIDUCIARY', 'PROSPECTUS', 'MANDATE', 'ESCROW', 'CONSORTIUM', 'DERIVATIVES'],
        'Tax': ['DEPRECIATION', 'FRANKING', 'WITHHOLDING', 'DEDUCTION', 'ASSESSMENT', 'COMPLIANCE', 'EXEMPTION', 'JURISDICTION', 'IMPUTATION', 'AMORTISATION', 'SUPERANNUATION'],
        'Advisory': ['STAKEHOLDER', 'GOVERNANCE', 'MATERIALITY', 'TRANSFORMATION', 'BENCHMARK', 'CONSULTING', 'STRATEGY', 'FRAMEWORK', 'RESILIENCE', 'PROCUREMENT', 'ENGAGEMENT'],
        'Audit': ['ASSERTION', 'MISSTATEMENT', 'SAMPLING', 'SUBSTANTIVE', 'ASSURANCE', 'RECONCILIATION', 'INDEPENDENCE', 'DISCLAIMER', 'ATTESTATION', 'VERIFICATION', 'IRREGULARITY']
    };

    const CATEGORY_COLOURS = {
        'Deals': KPMG.colours.blue,
        'Tax': KPMG.colours.purple,
        'Advisory': KPMG.colours.teal,
        'Audit': KPMG.colours.cobalt
    };

    const KB_ROWS = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    ];

    /* ---- state ---- */
    let currentWord = '';
    let currentCategory = '';
    let guessedLetters = new Set();
    let wrongCount = 0;
    let score = 0;
    let round = 0;
    let roundStartTime = 0;
    let gameActive = false;
    let usedWords = new Set();
    let timerInterval = null;

    /* ---- DOM refs (resolved at init time) ---- */
    let wordArea, categoryBadge, roundLabel, scoreLabel, barFill, barValue, wrongArea, timerEl, kbContainer;

    function reset() {
        currentWord = '';
        currentCategory = '';
        guessedLetters = new Set();
        wrongCount = 0;
        score = 0;
        round = 0;
        roundStartTime = 0;
        gameActive = false;
        usedWords = new Set();
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    /* ---- pick word ---- */
    function pickWord() {
        const categories = Object.keys(WORDS);
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const catWords = WORDS[cat].filter(function (w) { return !usedWords.has(w); });
        if (catWords.length === 0) {
            usedWords.clear();
            return pickWord();
        }
        const word = catWords[Math.floor(Math.random() * catWords.length)];
        usedWords.add(word);
        return { word: word, category: cat };
    }

    /* ---- render word ---- */
    function renderWord() {
        wordArea.innerHTML = '';
        for (var i = 0; i < currentWord.length; i++) {
            var slot = document.createElement('div');
            slot.className = 'ds-letter-slot';
            slot.id = 'ds-slot-' + i;
            if (guessedLetters.has(currentWord[i])) {
                slot.textContent = currentWord[i];
                slot.classList.add('revealed');
            }
            wordArea.appendChild(slot);
        }
    }

    /* ---- render keyboard ---- */
    function renderKeyboard() {
        kbContainer.innerHTML = '';
        KB_ROWS.forEach(function (row) {
            var rowDiv = document.createElement('div');
            rowDiv.className = 'ds-kb-row';
            row.forEach(function (letter) {
                var key = document.createElement('div');
                key.className = 'ds-key';
                key.textContent = letter;
                key.dataset.letter = letter;

                if (guessedLetters.has(letter)) {
                    if (currentWord.indexOf(letter) >= 0) {
                        key.classList.add('correct');
                    } else {
                        key.classList.add('wrong');
                    }
                }

                key.addEventListener('click', function () {
                    if (gameActive) guess(letter);
                });
                rowDiv.appendChild(key);
            });
            kbContainer.appendChild(rowDiv);
        });
    }

    /* ---- update deal bar ---- */
    function updateDealBar() {
        var remaining = MAX_WRONG - wrongCount;
        var pct = (remaining / MAX_WRONG) * 100;
        barFill.style.width = pct + '%';

        var value = Math.round(DEAL_START * remaining / MAX_WRONG);
        barValue.textContent = '$' + value + 'M';

        if (pct > 50) {
            barFill.style.background = KPMG.colours.green;
        } else if (pct > 25) {
            barFill.style.background = KPMG.colours.amber;
        } else {
            barFill.style.background = KPMG.colours.red;
        }
    }

    /* ---- render wrong guesses ---- */
    function renderWrong() {
        wrongArea.innerHTML = '';
        for (var i = 0; i < wrongCount; i++) {
            var x = document.createElement('div');
            x.className = 'ds-wrong-x';
            x.textContent = 'X';
            wrongArea.appendChild(x);
        }
    }

    /* ---- update timer ---- */
    function updateTimer() {
        if (!gameActive) return;
        var elapsed = Math.floor((Date.now() - roundStartTime) / 1000);
        var mins = Math.floor(elapsed / 60);
        var secs = elapsed % 60;
        timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    /* ---- check win ---- */
    function isWordComplete() {
        for (var i = 0; i < currentWord.length; i++) {
            if (!guessedLetters.has(currentWord[i])) return false;
        }
        return true;
    }

    /* ---- guess ---- */
    function guess(letter) {
        if (!gameActive) return;
        letter = letter.toUpperCase();
        if (guessedLetters.has(letter)) return;
        if (letter.length !== 1 || letter < 'A' || letter > 'Z') return;

        guessedLetters.add(letter);

        if (currentWord.indexOf(letter) >= 0) {
            renderWord();
            renderKeyboard();

            for (var i = 0; i < currentWord.length; i++) {
                if (currentWord[i] === letter) {
                    var slot = document.getElementById('ds-slot-' + i);
                    if (slot && typeof gsap !== 'undefined') {
                        gsap.from(slot, { scale: 1.3, duration: 0.25, ease: 'back.out(1.7)' });
                    }
                }
            }

            if (isWordComplete()) {
                wordSolved();
            }
        } else {
            wrongCount++;
            renderWrong();
            renderKeyboard();
            updateDealBar();

            if (wrongCount >= MAX_WRONG) {
                gameOver();
            }
        }
    }

    /* ---- word solved ---- */
    function wordSolved() {
        var remainingGuesses = MAX_WRONG - wrongCount;
        var elapsed = (Date.now() - roundStartTime) / 1000;

        var wordScore = 500;
        wordScore += remainingGuesses * 50;
        if (elapsed < 30) wordScore += 100;

        score += wordScore;
        GameEngine.state.score = score;
        scoreLabel.textContent = 'Score: ' + score;

        if (typeof gsap !== 'undefined') {
            gsap.to(wordArea, {
                backgroundColor: 'rgba(38, 153, 36, 0.15)',
                duration: 0.3,
                yoyo: true,
                repeat: 1,
                onComplete: function () {
                    wordArea.style.backgroundColor = '';
                    nextRound();
                }
            });
        } else {
            setTimeout(nextRound, 600);
        }
    }

    /* ---- next round ---- */
    function nextRound() {
        round++;
        wrongCount = 0;
        guessedLetters = new Set();

        var picked = pickWord();
        currentWord = picked.word;
        currentCategory = picked.category;
        roundStartTime = Date.now();

        categoryBadge.textContent = currentCategory;
        categoryBadge.style.background = CATEGORY_COLOURS[currentCategory] || KPMG.colours.blue;
        roundLabel.textContent = 'Round ' + round;

        renderWord();
        renderKeyboard();
        renderWrong();
        updateDealBar();
    }

    /* ---- game over ---- */
    function gameOver() {
        gameActive = false;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        for (var i = 0; i < currentWord.length; i++) {
            var slot = document.getElementById('ds-slot-' + i);
            if (slot && !guessedLetters.has(currentWord[i])) {
                slot.textContent = currentWord[i];
                slot.style.color = KPMG.colours.red;
                slot.style.borderColor = KPMG.colours.red;
            }
        }

        setTimeout(function () {
            GameEngine.endGame();
        }, 1200);
    }

    /* ---- keyboard handler ---- */
    let onPhysicalKey = null;

    function setupGameInput() {
        // Remove old listener if present
        if (onPhysicalKey) {
            document.removeEventListener('keydown', onPhysicalKey);
        }

        onPhysicalKey = function (e) {
            if (!gameActive) return;
            var key = e.key.toUpperCase();
            if (key.length === 1 && key >= 'A' && key <= 'Z') {
                e.preventDefault();
                guess(key);
            }
        };

        document.addEventListener('keydown', onPhysicalKey);
    }

    /* ---- init ---- */
    function init() {
        // Resolve DOM refs inside init
        wordArea = document.getElementById('ds-word-area');
        categoryBadge = document.getElementById('ds-category');
        roundLabel = document.getElementById('ds-round');
        scoreLabel = document.getElementById('ds-score');
        barFill = document.getElementById('ds-bar-fill');
        barValue = document.getElementById('ds-bar-value');
        wrongArea = document.getElementById('ds-wrong-area');
        timerEl = document.getElementById('ds-timer');
        kbContainer = document.getElementById('ds-keyboard');

        // Deal Spell is DOM-based, so we set up the overlay manually
        var container = document.getElementById('game-container');
        GameEngine._ensureOverlayContainer(container);
        GameEngine._logicalWidth = 480;
        GameEngine._logicalHeight = 700;
        GameEngine._options = { width: 480, height: 700, maxWidth: 480 };

        GameEngine.startGame(GAME_ID, {
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
                scoreLabel.textContent = 'Score: 0';
                GameEngine.state.score = 0;
            },
            onInit: function () {
                reset();
                scoreLabel.textContent = 'Score: 0';
                GameEngine.state.score = 0;
                setupGameInput();

                gameActive = true;
                timerInterval = setInterval(updateTimer, 1000);
                nextRound();
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
