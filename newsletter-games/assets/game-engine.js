/**
 * KPMG Newsletter Games — Shared Game Engine
 * All 12 minigames import this module for consistent branding,
 * lifecycle management, input handling, and score submission.
 */

/* ============================================================
   1. KPMG BRAND CONSTANTS
   ============================================================ */

const KPMG = {
    colours: {
        blue: '#00338D',
        pacific: '#00B8F5',
        cobalt: '#1E49E2',
        lightBlue: '#76D2FF',
        purple: '#7213EA',
        lightPurple: '#B497FF',
        teal: '#00C0AE',
        magenta: '#AB0D82',
        palette: [
            '#00338D', '#00B8F5', '#1E49E2', '#76D2FF',
            '#7213EA', '#B497FF', '#00C0AE', '#AB0D82'
        ],
        red: '#ED2124',
        amber: '#F1C44D',
        green: '#269924',
        dark: '#333333',
        mid: '#666666',
        light: '#B2B2B2',
        border: '#E5E5E5',
        white: '#FFFFFF'
    },
    fonts: {
        heading: 'bold 24px Arial, Helvetica, sans-serif',
        body: '14px Arial, Helvetica, sans-serif',
        score: 'bold 32px Arial, Helvetica, sans-serif',
        small: '11px Arial, Helvetica, sans-serif',
        hud: 'bold 16px Arial, Helvetica, sans-serif'
    }
};

/* ============================================================
   2. GAME ENGINE
   ============================================================ */

const GameEngine = {

    /* ---------- Configuration ---------- */
    MAX_ATTEMPTS: 3,
    HUD_HEIGHT: 48,
    COUNTDOWN_STEP_MS: 800,

    /* ---------- State ---------- */
    state: {
        score: 0,
        running: false,
        paused: false,
        gameOver: false,
        gameId: null,
        editionId: null,
        attemptsUsed: 0,
        attemptsRemaining: 3,
        bestScore: 0,
        startTime: 0
    },

    canvas: null,
    ctx: null,
    animFrameId: null,
    lastTimestamp: 0,
    _callbacks: null,
    _inputCleanup: null,
    _overlayEl: null,
    _resizeHandler: null,
    _options: {},
    _gameGeneration: 0, // incremented on each startGame to detect stale endGame callbacks

    /* ==========================================================
       CANVAS SETUP
       ========================================================== */

    initCanvas(containerId, options = {}) {
        const defaults = {
            width: 400,
            height: 700,
            maxWidth: 500,
            background: KPMG.colours.white
        };
        const opts = Object.assign({}, defaults, options);
        this._options = opts;

        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`GameEngine: container "#${containerId}" not found`);
        }

        // Get or create canvas
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = opts.width * dpr;
        canvas.height = opts.height * dpr;
        canvas.style.display = 'block';
        canvas.style.touchAction = 'none';
        canvas.style.userSelect = 'none';
        canvas.style.webkitUserSelect = 'none';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        this.canvas = canvas;
        this.ctx = ctx;
        this._logicalWidth = opts.width;
        this._logicalHeight = opts.height;

        // Ensure overlay container exists
        this._ensureOverlayContainer(container);

        // Initial resize
        this.handleResize();

        // Bind resize
        this._resizeHandler = () => this.handleResize();
        window.addEventListener('resize', this._resizeHandler);

        return { canvas, ctx };
    },

    handleResize() {
        if (!this.canvas) return;
        const parent = this.canvas.parentElement;
        if (!parent) return;

        const parentWidth = parent.clientWidth;
        const maxW = this._options.maxWidth || 500;
        const targetWidth = Math.min(parentWidth, maxW);
        const aspect = this._logicalHeight / this._logicalWidth;
        const targetHeight = targetWidth * aspect;

        this.canvas.style.width = targetWidth + 'px';
        this.canvas.style.height = targetHeight + 'px';

        // Resize overlay to match
        if (this._overlayEl) {
            this._overlayEl.style.width = targetWidth + 'px';
            this._overlayEl.style.height = targetHeight + 'px';
        }
    },

    _ensureOverlayContainer(container) {
        // Position the container relatively so overlay can be absolute
        const pos = window.getComputedStyle(container).position;
        if (pos === 'static') {
            container.style.position = 'relative';
        }

        let overlay = container.querySelector('.game-over-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'game-over-overlay';
            overlay.style.cssText = [
                'position: absolute',
                'top: 0',
                'left: 0',
                'width: 100%',
                'height: 100%',
                'display: none',
                'flex-direction: column',
                'align-items: center',
                'justify-content: center',
                'background: rgba(0,51,141,0.92)',
                'z-index: 100',
                'color: ' + KPMG.colours.white,
                'font-family: Arial, Helvetica, sans-serif',
                'text-align: center',
                'padding: 24px',
                'box-sizing: border-box',
                'border-radius: 4px'
            ].join(';');
            container.appendChild(overlay);
        }
        this._overlayEl = overlay;
    },

    /* ==========================================================
       AUTH INTEGRATION
       ========================================================== */

    getToken() {
        return localStorage.getItem('mg_token');
    },

    async getUser() {
        const token = this.getToken();
        if (!token) return null;
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) return null;
            return res.json();
        } catch (_) {
            return null;
        }
    },

    async checkAttempts(gameId, editionId) {
        const token = this.getToken();
        const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
        try {
            const params = new URLSearchParams({ game_id: gameId });
            if (editionId != null) params.set('edition_id', editionId);
            const res = await fetch(
                `/api/attempts?${params.toString()}`,
                { headers }
            );
            if (!res.ok) {
                return { used: 0, remaining: this.MAX_ATTEMPTS, best_score: 0, attempts: [] };
            }
            // Server returns { used, remaining, best_score, attempts: [...] }
            return res.json();
        } catch (_) {
            return { used: 0, remaining: this.MAX_ATTEMPTS, best_score: 0, attempts: [] };
        }
    },

    /* ==========================================================
       GAME LIFECYCLE
       ========================================================== */

    async startGame(gameId, callbacks) {
        // Increment generation to invalidate any in-flight endGame from previous session
        this._gameGeneration++;

        // 1. Check auth — allow demo/static mode when no token present
        const token = this.getToken();
        const demoMode = !token;

        // 2. Get current edition (skip in demo mode)
        let edition = null;
        if (!demoMode) {
            try {
                const res = await fetch('/api/editions/current', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    edition = await res.json();
                }
            } catch (_) {
                // Proceed with null edition — allow offline play
            }
        }

        const editionId = edition ? edition.id : null;

        // 3. Check remaining attempts (unlimited in demo mode)
        const attempts = demoMode
            ? { used: 0, remaining: this.MAX_ATTEMPTS, best_score: 0, attempts: [] }
            : await this.checkAttempts(gameId, editionId);

        // 4. If no attempts left, show locked overlay
        if (attempts.remaining <= 0) {
            this.state.bestScore = attempts.best_score || 0;
            this.renderLockedOverlay();
            return false;
        }

        // 5. Reset state (preserve reference via Object.assign)
        Object.assign(this.state, {
            score: 0,
            running: true,
            paused: false,
            gameOver: false,
            gameId: gameId,
            editionId: editionId,
            attemptsUsed: attempts.used,
            attemptsRemaining: attempts.remaining,
            bestScore: attempts.best_score || 0,
            startTime: 0
        });

        // 6. Store callbacks
        this._callbacks = {
            onUpdate: callbacks.onUpdate || function () {},
            onDraw: callbacks.onDraw || function () {},
            onGameOver: callbacks.onGameOver || function () {},
            onReset: callbacks.onReset || null,
            onInit: callbacks.onInit || null,
            onCountdownComplete: callbacks.onCountdownComplete || null
        };

        // 7. Hide any existing overlay
        this._hideOverlay();

        // 8. Call onInit to set up input and game-specific state
        if (this._callbacks.onInit) {
            this._callbacks.onInit();
        }

        // 9. Show countdown, then start loop (skip loop for DOM-based games with no canvas)
        return new Promise((resolve) => {
            this.renderCountdown(3, () => {
                this.state.startTime = performance.now();
                this.lastTimestamp = performance.now();
                if (this.canvas && this.ctx) {
                    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
                }
                // Notify game that countdown finished (used by DOM games to defer gameActive)
                if (this._callbacks.onCountdownComplete) {
                    this._callbacks.onCountdownComplete();
                }
                resolve(true);
            });
        });
    },

    gameLoop(timestamp) {
        if (!this.state.running) return;

        const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;

        if (!this.state.paused) {
            this._callbacks.onUpdate(dt);
        }

        // onUpdate may have called endGame() — check before continuing
        if (!this.state.running) return;

        this._callbacks.onDraw(this.ctx);
        this.renderHUD();

        if (this.state.paused) {
            this.renderPauseOverlay();
        }

        this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
    },

    async endGame() {
        // Guard against double calls (e.g. boundary + collision on same frame,
        // or timer expiry during level-complete transition)
        if (this.state.gameOver) return;

        this.state.running = false;
        this.state.gameOver = true;

        // Capture generation so we can detect if a new game started during async ops
        const gen = this._gameGeneration;

        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        // Clean up input listeners
        if (this._inputCleanup) {
            this._inputCleanup();
            this._inputCleanup = null;
        }

        // Calculate duration
        const durationMs = this.state.startTime
            ? Math.round(performance.now() - this.state.startTime)
            : 0;

        // Notify game-specific handler
        this._callbacks.onGameOver(this.state.score);

        // Submit score
        let result = null;
        try {
            result = await this.submitScore(this.state.score, durationMs);
        } catch (_) {
            // API failure — proceed with local data
        }

        // If a new game started while we were awaiting, abort — don't clobber the new game
        if (this._gameGeneration !== gen) return;

        // Update state from server response
        if (result) {
            this.state.attemptsRemaining = result.remaining;
            this.state.bestScore = result.best_score || Math.max(this.state.bestScore, this.state.score);
        } else {
            this.state.attemptsRemaining = Math.max(0, this.state.attemptsRemaining - 1);
            this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
        }

        this.renderGameOver({
            score: this.state.score,
            bestScore: this.state.bestScore,
            rank: result ? result.leaderboard_rank : null,
            remaining: this.state.attemptsRemaining
        });
    },

    async submitScore(score, durationMs) {
        const token = this.getToken();
        if (!token) return null;

        // Skip submission if no edition (offline play)
        if (this.state.editionId == null) return null;

        try {
            const res = await fetch('/api/attempts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    game_id: this.state.gameId,
                    edition_id: this.state.editionId,
                    score: score,
                    duration_ms: durationMs
                })
            });
            if (!res.ok) return null;
            return res.json();
        } catch (_) {
            return null;
        }
    },

    /* ==========================================================
       HUD RENDERING
       ========================================================== */

    renderHUD() {
        const ctx = this.ctx;
        if (!ctx) return; // DOM-based games have no canvas HUD
        const w = this._logicalWidth;
        const h = this.HUD_HEIGHT;

        ctx.save();

        // Semi-transparent dark bar
        ctx.fillStyle = 'rgba(0, 51, 141, 0.85)';
        ctx.fillRect(0, 0, w, h);

        // Score — left
        ctx.font = KPMG.fonts.hud;
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Score: ' + this.state.score, 12, h / 2);

        // Attempts dots — right
        const dotRadius = 6;
        const dotSpacing = 18;
        const totalDotsWidth = this.MAX_ATTEMPTS * dotSpacing;
        const dotsStartX = w - 12 - totalDotsWidth;

        for (let i = 0; i < this.MAX_ATTEMPTS; i++) {
            const cx = dotsStartX + i * dotSpacing + dotRadius;
            const cy = h / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
            if (i < this.state.attemptsRemaining) {
                ctx.fillStyle = KPMG.colours.white;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
            }
            ctx.fill();
        }

        // Timer — centre
        if (this.state.startTime) {
            const elapsed = Math.floor((performance.now() - this.state.startTime) / 1000);
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            const timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
            ctx.font = KPMG.fonts.hud;
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.fillText(timeStr, w / 2, h / 2);
        }

        ctx.restore();
    },

    /* ==========================================================
       OVERLAYS
       ========================================================== */

    renderCountdown(count, callback) {
        const ctx = this.ctx;
        const w = this._logicalWidth;
        const h = this._logicalHeight;
        const steps = ['3', '2', '1', 'GO!'];
        let stepIndex = 0;

        const hasGSAP = typeof gsap !== 'undefined';

        // DOM-based games have no canvas context — use a DOM overlay countdown
        if (!ctx) {
            const overlay = this._overlayEl;
            if (!overlay) {
                callback();
                return;
            }

            overlay.style.display = 'flex';
            const countdownEl = document.createElement('div');
            countdownEl.style.cssText = 'font: bold 72px Arial, Helvetica, sans-serif; color: ' + KPMG.colours.white + ';';
            overlay.innerHTML = '';
            overlay.appendChild(countdownEl);

            const stepDuration = this.COUNTDOWN_STEP_MS;

            const domStep = () => {
                if (stepIndex >= steps.length) {
                    overlay.style.display = 'none';
                    overlay.innerHTML = '';
                    callback();
                    return;
                }
                countdownEl.textContent = steps[stepIndex];
                countdownEl.style.transform = 'scale(0.3)';
                countdownEl.style.opacity = '0';
                countdownEl.style.transition = 'transform ' + (stepDuration * 0.6 / 1000) + 's cubic-bezier(0.34, 1.56, 0.64, 1), opacity ' + (stepDuration * 0.4 / 1000) + 's ease';

                // Force reflow then animate
                void countdownEl.offsetWidth;
                countdownEl.style.transform = 'scale(1)';
                countdownEl.style.opacity = '1';

                setTimeout(() => {
                    stepIndex++;
                    domStep();
                }, stepDuration);
            };

            domStep();
            return;
        }

        const drawStep = () => {
            if (stepIndex >= steps.length) {
                callback();
                return;
            }

            const label = steps[stepIndex];
            const stepDuration = this.COUNTDOWN_STEP_MS;

            if (hasGSAP) {
                // GSAP-powered countdown
                const proxy = { scale: 0.3, opacity: 0 };
                const startTime = performance.now();

                const animate = () => {
                    const elapsed = performance.now() - startTime;
                    if (elapsed > stepDuration) {
                        stepIndex++;
                        drawStep();
                        return;
                    }

                    // Clear and draw game background
                    ctx.save();
                    ctx.fillStyle = 'rgba(0, 51, 141, 0.7)';
                    ctx.fillRect(0, 0, w, h);
                    ctx.restore();

                    requestAnimationFrame(animate);
                };

                gsap.fromTo(proxy,
                    { scale: 0.3, opacity: 0 },
                    {
                        scale: 1,
                        opacity: 1,
                        duration: stepDuration / 1000 * 0.6,
                        ease: 'back.out(1.7)',
                        onUpdate: () => {
                            ctx.save();
                            ctx.fillStyle = 'rgba(0, 51, 141, 0.7)';
                            ctx.fillRect(0, 0, w, h);

                            ctx.globalAlpha = proxy.opacity;
                            ctx.font = 'bold ' + Math.round(72 * proxy.scale) + 'px Arial, Helvetica, sans-serif';
                            ctx.fillStyle = KPMG.colours.white;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(label, w / 2, h / 2);
                            ctx.restore();
                        },
                        onComplete: () => {
                            setTimeout(() => {
                                stepIndex++;
                                drawStep();
                            }, stepDuration * 0.4);
                        }
                    }
                );
            } else {
                // Fallback: plain rendering with requestAnimationFrame
                const animStart = performance.now();
                const animDuration = stepDuration;

                const tick = () => {
                    const progress = Math.min((performance.now() - animStart) / animDuration, 1);

                    // Ease out
                    const eased = 1 - Math.pow(1 - Math.min(progress * 1.6, 1), 3);
                    const scale = 0.3 + 0.7 * eased;
                    const alpha = Math.min(progress * 2, 1) * (progress < 0.8 ? 1 : (1 - progress) / 0.2);

                    ctx.save();
                    ctx.fillStyle = 'rgba(0, 51, 141, 0.7)';
                    ctx.fillRect(0, 0, w, h);

                    ctx.globalAlpha = Math.max(0, alpha);
                    ctx.font = 'bold ' + Math.round(72 * scale) + 'px Arial, Helvetica, sans-serif';
                    ctx.fillStyle = KPMG.colours.white;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, w / 2, h / 2);
                    ctx.restore();

                    if (progress < 1) {
                        requestAnimationFrame(tick);
                    } else {
                        stepIndex++;
                        drawStep();
                    }
                };

                requestAnimationFrame(tick);
            }
        };

        drawStep();
    },

    renderGameOver(data) {
        const overlay = this._overlayEl;
        if (!overlay) return;

        const score = data.score || 0;
        const best = data.bestScore || 0;
        const rank = data.rank;
        const remaining = data.remaining || 0;

        overlay.innerHTML = '';
        overlay.style.display = 'flex';

        // Title
        const title = document.createElement('div');
        title.textContent = 'GAME OVER';
        title.style.cssText = 'font: bold 28px Arial, Helvetica, sans-serif; margin-bottom: 24px; letter-spacing: 2px;';
        overlay.appendChild(title);

        // Score (animated count-up)
        const scoreLabel = document.createElement('div');
        scoreLabel.textContent = 'SCORE';
        scoreLabel.style.cssText = 'font: ' + KPMG.fonts.small + '; opacity: 0.7; margin-bottom: 4px;';
        overlay.appendChild(scoreLabel);

        const scoreEl = document.createElement('div');
        scoreEl.textContent = '0';
        scoreEl.style.cssText = 'font: bold 56px Arial, Helvetica, sans-serif; margin-bottom: 20px;';
        overlay.appendChild(scoreEl);

        // Best score
        const bestEl = document.createElement('div');
        bestEl.textContent = 'Best: ' + best;
        bestEl.style.cssText = 'font: ' + KPMG.fonts.hud + '; margin-bottom: 8px; opacity: 0.8;';
        overlay.appendChild(bestEl);

        // Rank
        if (rank !== null && rank !== undefined) {
            const rankEl = document.createElement('div');
            rankEl.textContent = 'Leaderboard: #' + rank;
            rankEl.style.cssText = 'font: ' + KPMG.fonts.body + '; margin-bottom: 8px; opacity: 0.8;';
            overlay.appendChild(rankEl);
        }

        // Attempts remaining
        const attEl = document.createElement('div');
        attEl.textContent = remaining > 0
            ? remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining'
            : 'No attempts remaining';
        attEl.style.cssText = 'font: ' + KPMG.fonts.body + '; margin-bottom: 28px; opacity: 0.7;';
        overlay.appendChild(attEl);

        // Buttons
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;';

        const btnStyle = [
            'padding: 12px 28px',
            'border: 2px solid ' + KPMG.colours.white,
            'border-radius: 4px',
            'font: bold 14px Arial, Helvetica, sans-serif',
            'cursor: pointer',
            'transition: background 0.2s, color 0.2s',
            'text-transform: uppercase',
            'letter-spacing: 1px'
        ].join(';');

        if (remaining > 0) {
            const playBtn = document.createElement('button');
            playBtn.textContent = 'Play Again';
            playBtn.style.cssText = btnStyle + ';background:' + KPMG.colours.white + ';color:' + KPMG.colours.blue + ';';
            playBtn.addEventListener('click', () => {
                this._hideOverlay();
                // Call onReset to let the game clean up before replay
                if (this._callbacks && this._callbacks.onReset) {
                    this._callbacks.onReset();
                }
                // Re-start with same callbacks (onInit will re-register input & state)
                if (this._callbacks) {
                    this.startGame(this.state.gameId, this._callbacks);
                }
            });
            btnContainer.appendChild(playBtn);
        }

        const hubBtn = document.createElement('button');
        hubBtn.textContent = 'Back to Hub';
        hubBtn.style.cssText = btnStyle + ';background: transparent;color:' + KPMG.colours.white + ';';
        hubBtn.addEventListener('click', () => this.goToHub());
        btnContainer.appendChild(hubBtn);

        overlay.appendChild(btnContainer);

        // Animate elements
        const children = Array.from(overlay.children);
        const hasGSAP = typeof gsap !== 'undefined';

        if (hasGSAP) {
            children.forEach((el) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px)';
            });

            gsap.to(children, {
                opacity: 1,
                y: 0,
                duration: 0.4,
                stagger: 0.1,
                ease: 'power2.out'
            });

            // Animated count-up for score
            const counter = { val: 0 };
            gsap.to(counter, {
                val: score,
                duration: 1.2,
                ease: 'power2.out',
                delay: 0.3,
                onUpdate: () => {
                    scoreEl.textContent = Math.round(counter.val);
                }
            });
        } else {
            // Fallback: staggered reveal without GSAP
            children.forEach((el, i) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px)';
                el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                setTimeout(() => {
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0)';
                }, i * 100);
            });

            // Fallback count-up
            const countDuration = 1200;
            const countStart = performance.now();
            const countUp = () => {
                const elapsed = performance.now() - countStart;
                const progress = Math.min(elapsed / countDuration, 1);
                const eased = 1 - Math.pow(1 - progress, 2);
                scoreEl.textContent = Math.round(score * eased);
                if (progress < 1) {
                    requestAnimationFrame(countUp);
                }
            };
            setTimeout(() => requestAnimationFrame(countUp), 300);
        }
    },

    renderLockedOverlay() {
        const overlay = this._overlayEl;
        if (!overlay) return;

        overlay.innerHTML = '';
        overlay.style.display = 'flex';

        const icon = document.createElement('div');
        icon.textContent = '\uD83D\uDD12';
        icon.style.cssText = 'font-size: 48px; margin-bottom: 16px;';
        overlay.appendChild(icon);

        const title = document.createElement('div');
        title.textContent = 'No Attempts Remaining';
        title.style.cssText = 'font: bold 22px Arial, Helvetica, sans-serif; margin-bottom: 16px;';
        overlay.appendChild(title);

        if (this.state.bestScore > 0) {
            const bestEl = document.createElement('div');
            bestEl.textContent = 'Your Best: ' + this.state.bestScore;
            bestEl.style.cssText = 'font: ' + KPMG.fonts.hud + '; margin-bottom: 24px; opacity: 0.8;';
            overlay.appendChild(bestEl);
        }

        const hubBtn = document.createElement('button');
        hubBtn.textContent = 'Back to Hub';
        hubBtn.style.cssText = [
            'padding: 12px 28px',
            'border: 2px solid ' + KPMG.colours.white,
            'border-radius: 4px',
            'font: bold 14px Arial, Helvetica, sans-serif',
            'cursor: pointer',
            'background: ' + KPMG.colours.white,
            'color: ' + KPMG.colours.blue,
            'text-transform: uppercase',
            'letter-spacing: 1px'
        ].join(';');
        hubBtn.addEventListener('click', () => this.goToHub());
        overlay.appendChild(hubBtn);
    },

    renderPauseOverlay() {
        const ctx = this.ctx;
        if (!ctx) return; // DOM-based games have no canvas pause overlay
        const w = this._logicalWidth;
        const h = this._logicalHeight;

        ctx.save();

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 51, 141, 0.75)';
        ctx.fillRect(0, 0, w, h);

        // PAUSED text
        ctx.font = 'bold 36px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', w / 2, h / 2 - 30);

        // Instructions
        ctx.font = KPMG.fonts.body;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Press ESC to resume', w / 2, h / 2 + 20);

        ctx.restore();
    },

    _hideOverlay() {
        if (this._overlayEl) {
            this._overlayEl.style.display = 'none';
            this._overlayEl.innerHTML = '';
        }
    },

    /* ==========================================================
       INPUT HANDLING
       ========================================================== */

    setupInput(handlers = {}) {
        const el = this.canvas;
        if (!el) {
            throw new Error('GameEngine: canvas not initialised — call initCanvas first');
        }

        const listeners = [];

        const addListener = (target, event, fn, opts) => {
            target.addEventListener(event, fn, opts);
            listeners.push({ target, event, fn, opts });
        };

        // --- Swipe / Tap via pointer events ---
        let pointerStartX = 0;
        let pointerStartY = 0;
        let pointerStartTime = 0;
        const SWIPE_THRESHOLD = 30;
        const SWIPE_MAX_TIME = 500;

        const onPointerDown = (e) => {
            if (!e.isPrimary) return;
            pointerStartX = e.clientX;
            pointerStartY = e.clientY;
            pointerStartTime = performance.now();
        };

        const onPointerUp = (e) => {
            if (!e.isPrimary) return;
            const dx = e.clientX - pointerStartX;
            const dy = e.clientY - pointerStartY;
            const elapsed = performance.now() - pointerStartTime;

            if (elapsed > SWIPE_MAX_TIME) return;

            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
                // Tap
                if (handlers.onTap) {
                    const rect = el.getBoundingClientRect();
                    const scaleX = this._logicalWidth / rect.width;
                    const scaleY = this._logicalHeight / rect.height;
                    handlers.onTap(
                        (e.clientX - rect.left) * scaleX,
                        (e.clientY - rect.top) * scaleY
                    );
                }
            } else if (absDx > absDy) {
                // Horizontal swipe
                if (dx > 0 && handlers.onSwipeRight) handlers.onSwipeRight();
                if (dx < 0 && handlers.onSwipeLeft) handlers.onSwipeLeft();
            } else {
                // Vertical swipe
                if (dy > 0 && handlers.onSwipeDown) handlers.onSwipeDown();
                if (dy < 0 && handlers.onSwipeUp) handlers.onSwipeUp();
            }
        };

        addListener(el, 'pointerdown', onPointerDown);
        addListener(el, 'pointerup', onPointerUp);

        // --- Touch fallback for older browsers ---
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;

        const onTouchStart = (e) => {
            if (e.touches.length !== 1) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartTime = performance.now();
        };

        const onTouchEnd = (e) => {
            if (e.changedTouches.length < 1) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            const elapsed = performance.now() - touchStartTime;

            if (elapsed > SWIPE_MAX_TIME) return;

            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
                if (handlers.onTap) {
                    const rect = el.getBoundingClientRect();
                    const scaleX = this._logicalWidth / rect.width;
                    const scaleY = this._logicalHeight / rect.height;
                    handlers.onTap(
                        (touch.clientX - rect.left) * scaleX,
                        (touch.clientY - rect.top) * scaleY
                    );
                }
            } else if (absDx > absDy) {
                if (dx > 0 && handlers.onSwipeRight) handlers.onSwipeRight();
                if (dx < 0 && handlers.onSwipeLeft) handlers.onSwipeLeft();
            } else {
                if (dy > 0 && handlers.onSwipeDown) handlers.onSwipeDown();
                if (dy < 0 && handlers.onSwipeUp) handlers.onSwipeUp();
            }
        };

        // Only add touch if no pointer support
        if (!window.PointerEvent) {
            addListener(el, 'touchstart', onTouchStart, { passive: true });
            addListener(el, 'touchend', onTouchEnd);
        }

        // --- Keyboard ---
        const onKeyDown = (e) => {
            // Pause toggle
            if (e.key === 'Escape') {
                if (this.state.running && !this.state.gameOver) {
                    this.state.paused = !this.state.paused;
                }
                return;
            }

            // Don't handle keys if paused or game over
            if (this.state.paused || this.state.gameOver) return;

            if (handlers.onKey) {
                handlers.onKey(e.key);
            }

            switch (e.key) {
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    if (handlers.onTap) handlers.onTap(this._logicalWidth / 2, this._logicalHeight / 2);
                    break;
                case 'ArrowLeft':
                case 'ArrowRight':
                case 'ArrowUp':
                case 'ArrowDown':
                    e.preventDefault();
                    // Arrow keys fire onKey only (handled above).
                    // Swipe handlers are reserved for touch/pointer gestures.
                    break;
            }
        };

        addListener(document, 'keydown', onKeyDown);

        // Return cleanup function
        const cleanup = () => {
            listeners.forEach(({ target, event, fn, opts }) => {
                target.removeEventListener(event, fn, opts);
            });
            listeners.length = 0;
        };

        this._inputCleanup = cleanup;
        return cleanup;
    },

    /* ==========================================================
       COLLISION DETECTION
       ========================================================== */

    collisionRect(a, b) {
        return a.x < b.x + b.w &&
               a.x + a.w > b.x &&
               a.y < b.y + b.h &&
               a.y + a.h > b.y;
    },

    collisionCircle(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy) < a.r + b.r;
    },

    /* ==========================================================
       UTILITIES
       ========================================================== */

    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    },

    randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    },

    randomInt(min, max) {
        return Math.floor(this.randomBetween(min, max + 1));
    },

    /* ==========================================================
       DRAWING HELPERS
       ========================================================== */

    drawRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    },

    drawText(ctx, text, x, y, options = {}) {
        ctx.save();

        ctx.font = options.font || KPMG.fonts.body;
        ctx.fillStyle = options.color || KPMG.colours.white;
        ctx.textAlign = options.align || 'left';
        ctx.textBaseline = options.baseline || 'top';

        if (options.shadow) {
            ctx.shadowColor = options.shadow.color || 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = options.shadow.blur || 4;
            ctx.shadowOffsetX = options.shadow.offsetX || 0;
            ctx.shadowOffsetY = options.shadow.offsetY || 2;
        }

        if (options.maxWidth) {
            ctx.fillText(text, x, y, options.maxWidth);
        } else {
            ctx.fillText(text, x, y);
        }

        ctx.restore();
    },

    /* ==========================================================
       RESPONSIVE HELPERS
       ========================================================== */

    isMobile() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    },

    prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /* ==========================================================
       NAVIGATION
       ========================================================== */

    goToHub() {
        window.location.href = '../../';
    },

    /* ==========================================================
       CLEANUP
       ========================================================== */

    destroy() {
        // Stop game loop
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        // Remove input listeners
        if (this._inputCleanup) {
            this._inputCleanup();
            this._inputCleanup = null;
        }

        // Remove resize listener
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }

        // Clear overlay
        this._hideOverlay();

        this.state.running = false;
        this.canvas = null;
        this.ctx = null;
    }
};
