/**
 * KPI Catcher — Catch/Dodge falling KPI cards
 * Catch green KPIs, dodge red ones, grab gold bonuses!
 */
(function () {
    'use strict';

    const GAME_ID = 'kpi-catcher';
    const W = 400;
    const H = 700;
    const HUD_H = GameEngine.HUD_HEIGHT;

    // Paddle
    const PADDLE_W = 80;
    const PADDLE_H = 20;
    const PADDLE_Y = H - 50;
    const PADDLE_SPEED = 350; // px/s for keyboard

    // KPI card dimensions
    const CARD_W = 60;
    const CARD_H = 30;
    const CARD_BORDER = 4;

    // Round
    const ROUND_DURATION = 90; // seconds
    const GOLD_INTERVAL = 30; // seconds

    // KPI definitions
    const GREEN_KPIS = ['Revenue \u2191', 'NPS \u2191', 'Margin \u2191', 'Retention \u2191', 'Pipeline \u2191', 'Utilisation \u2191'];
    const RED_KPIS = ['Churn \u2191', 'Costs \u2191', 'Attrition \u2191', 'Defects \u2191', 'Overdue \u2191', 'Rework \u2191'];
    const GOLD_KPI = 'EBITDA +10%';

    // State
    let paddleX = W / 2 - PADDLE_W / 2;
    let cards = [];
    let streak = 0;
    let maxStreak = 0;
    let elapsed = 0;
    let spawnTimer = 0;
    let lastGoldTime = -GOLD_INTERVAL;
    let flashColor = null;
    let flashTimer = 0;
    let gameActive = false;

    // Input tracking
    let keysDown = {};
    let dragging = false;
    let dragOffsetX = 0;

    function reset() {
        paddleX = W / 2 - PADDLE_W / 2;
        cards = [];
        streak = 0;
        maxStreak = 0;
        elapsed = 0;
        spawnTimer = 1.0;
        lastGoldTime = -GOLD_INTERVAL;
        flashColor = null;
        flashTimer = 0;
        gameActive = false;
        keysDown = {};
        dragging = false;
    }

    function getSpawnInterval() {
        const t = Math.min(elapsed / ROUND_DURATION, 1);
        return GameEngine.lerp(1.0, 0.35, t);
    }

    function getCardSpeed() {
        const t = Math.min(elapsed / ROUND_DURATION, 1);
        return GameEngine.lerp(120, 280, t);
    }

    function getMultiplier() {
        return Math.min(streak + 1, 5);
    }

    function spawnCard() {
        let type = 'green';
        const roll = Math.random();

        if (elapsed - lastGoldTime >= GOLD_INTERVAL && roll < 0.08) {
            type = 'gold';
            lastGoldTime = elapsed;
        } else if (roll < 0.40) {
            type = 'red';
        }

        let label;
        if (type === 'green') {
            label = GREEN_KPIS[GameEngine.randomInt(0, GREEN_KPIS.length - 1)];
        } else if (type === 'red') {
            label = RED_KPIS[GameEngine.randomInt(0, RED_KPIS.length - 1)];
        } else {
            label = GOLD_KPI;
        }

        const x = GameEngine.randomBetween(10, W - CARD_W - 10);
        const speed = getCardSpeed() * GameEngine.randomBetween(0.8, 1.2);
        const drift = GameEngine.randomBetween(-20, 20);

        cards.push({
            x: x,
            y: HUD_H - CARD_H,
            speed: speed,
            drift: drift,
            type: type,
            label: label,
            caught: false,
            catchTimer: 0
        });
    }

    function getBorderColor(type) {
        if (type === 'green') return KPMG.colours.green;
        if (type === 'red') return KPMG.colours.red;
        return KPMG.colours.amber;
    }

    // --- Callbacks ---
    function onUpdate(dt) {
        if (!gameActive) return;

        elapsed += dt;

        if (elapsed >= ROUND_DURATION) {
            gameActive = false;
            GameEngine.endGame();
            return;
        }

        if (keysDown['ArrowLeft'] || keysDown['a']) {
            paddleX -= PADDLE_SPEED * dt;
        }
        if (keysDown['ArrowRight'] || keysDown['d']) {
            paddleX += PADDLE_SPEED * dt;
        }
        paddleX = GameEngine.clamp(paddleX, 0, W - PADDLE_W);

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            spawnCard();
            spawnTimer = getSpawnInterval();
        }

        const paddleRect = { x: paddleX, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H };

        for (let i = cards.length - 1; i >= 0; i--) {
            const c = cards[i];

            if (c.caught) {
                c.catchTimer += dt;
                if (c.catchTimer > 0.3) {
                    cards.splice(i, 1);
                }
                continue;
            }

            c.y += c.speed * dt;
            c.x += c.drift * dt;
            c.x = GameEngine.clamp(c.x, 0, W - CARD_W);

            const cardRect = { x: c.x, y: c.y, w: CARD_W, h: CARD_H };

            if (GameEngine.collisionRect(cardRect, paddleRect)) {
                c.caught = true;
                c.catchTimer = 0;

                if (c.type === 'green') {
                    const mult = getMultiplier();
                    GameEngine.state.score += 100 * mult;
                    streak++;
                    if (streak > maxStreak) maxStreak = streak;
                    flashColor = KPMG.colours.green;
                    flashTimer = 0.15;
                } else if (c.type === 'red') {
                    GameEngine.state.score = Math.max(0, GameEngine.state.score - 200);
                    streak = 0;
                    flashColor = KPMG.colours.red;
                    flashTimer = 0.2;
                } else {
                    GameEngine.state.score += 500;
                    streak++;
                    if (streak > maxStreak) maxStreak = streak;
                    flashColor = KPMG.colours.amber;
                    flashTimer = 0.25;
                }
                continue;
            }

            if (c.y > H) {
                if (c.type === 'green') {
                    GameEngine.state.score = Math.max(0, GameEngine.state.score - 50);
                    streak = 0;
                }
                cards.splice(i, 1);
            }
        }

        if (flashTimer > 0) {
            flashTimer -= dt;
        }
    }

    function onDraw(ctx) {
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, W, H);

        if (flashTimer > 0 && flashColor) {
            ctx.save();
            ctx.globalAlpha = flashTimer * 3;
            ctx.fillStyle = flashColor;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        const timeLeft = Math.max(0, ROUND_DURATION - elapsed);
        const timePct = timeLeft / ROUND_DURATION;
        ctx.fillStyle = KPMG.colours.border;
        ctx.fillRect(0, HUD_H, W, 4);
        ctx.fillStyle = timePct > 0.3 ? KPMG.colours.pacific : KPMG.colours.red;
        ctx.fillRect(0, HUD_H, W * timePct, 4);

        if (streak > 0) {
            const mult = getMultiplier();
            const badgeText = '\u00D7' + mult;
            const badgeX = W - 50;
            const badgeY = HUD_H + 14;

            ctx.save();
            ctx.fillStyle = mult >= 5 ? KPMG.colours.purple : KPMG.colours.cobalt;
            GameEngine.drawRoundedRect(ctx, badgeX, badgeY, 40, 24, 12);
            ctx.fill();
            ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, badgeX + 20, badgeY + 12);
            ctx.restore();

            ctx.font = '11px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.mid;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText('Streak: ' + streak, W - 12, HUD_H + 42);
        }

        ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.dark;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(Math.ceil(timeLeft) + 's', 12, HUD_H + 14);

        for (const c of cards) {
            ctx.save();

            if (c.caught) {
                const t = c.catchTimer / 0.3;
                ctx.globalAlpha = 1 - t;
                const scale = 1 + t * 0.3;
                ctx.translate(c.x + CARD_W / 2, c.y + CARD_H / 2);
                ctx.scale(scale, scale);
                ctx.translate(-CARD_W / 2, -CARD_H / 2);
            } else {
                ctx.translate(c.x, c.y);
            }

            ctx.fillStyle = KPMG.colours.white;
            ctx.strokeStyle = KPMG.colours.border;
            ctx.lineWidth = 1;
            GameEngine.drawRoundedRect(ctx, 0, 0, CARD_W, CARD_H, 4);
            ctx.fill();
            ctx.stroke();

            const borderCol = getBorderColor(c.type);
            ctx.fillStyle = borderCol;
            GameEngine.drawRoundedRect(ctx, 0, 0, CARD_BORDER, CARD_H, 2);
            ctx.fill();

            if (c.type === 'gold' && !c.caught) {
                ctx.shadowColor = KPMG.colours.amber;
                ctx.shadowBlur = 8 + Math.sin(elapsed * 6) * 4;
                ctx.strokeStyle = KPMG.colours.amber;
                ctx.lineWidth = 2;
                GameEngine.drawRoundedRect(ctx, 0, 0, CARD_W, CARD_H, 4);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.dark;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(c.label, CARD_W / 2 + 2, CARD_H / 2);

            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = KPMG.colours.blue;
        GameEngine.drawRoundedRect(ctx, paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, 4);
        ctx.fill();

        ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DASHBOARD', paddleX + PADDLE_W / 2, PADDLE_Y + PADDLE_H / 2);
        ctx.restore();
    }

    function onGameOver(score) {
        gameActive = false;
    }

    // --- Input ---
    function setupGameInput() {
        const canvas = GameEngine.canvas;

        const onKeyDown = (e) => {
            if (!gameActive) return; // ignore input before game starts / during countdown
            keysDown[e.key] = true;
            if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) {
                e.preventDefault();
            }
        };
        const onKeyUp = (e) => {
            delete keysDown[e.key];
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        const getCanvasX = (clientX) => {
            const rect = canvas.getBoundingClientRect();
            return (clientX - rect.left) * (W / rect.width);
        };

        const onPointerDown = (e) => {
            if (!e.isPrimary) return;
            const cx = getCanvasX(e.clientX);
            if (cx >= paddleX - 20 && cx <= paddleX + PADDLE_W + 20) {
                dragging = true;
                dragOffsetX = cx - paddleX;
            } else {
                dragging = true;
                dragOffsetX = PADDLE_W / 2;
                paddleX = GameEngine.clamp(cx - PADDLE_W / 2, 0, W - PADDLE_W);
            }
        };

        const onPointerMove = (e) => {
            if (!dragging || !e.isPrimary) return;
            const cx = getCanvasX(e.clientX);
            paddleX = GameEngine.clamp(cx - dragOffsetX, 0, W - PADDLE_W);
        };

        const onPointerUp = () => {
            dragging = false;
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerUp);

        const origCleanup = GameEngine._inputCleanup;
        GameEngine._inputCleanup = () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointerleave', onPointerUp);
            keysDown = {};
            dragging = false;
            if (origCleanup) origCleanup();
        };
    }

    // --- Init ---
    function init() {
        GameEngine.initCanvas('game-container', {
            width: W,
            height: H,
            maxWidth: 640
        });

        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'HOW TO PLAY',
                objective: 'Catch the green KPI cards falling from above. Dodge the red ones — they cost you points! Gold cards are bonus.',
                controls: [
                    'Arrow keys or move mouse to slide the paddle left/right',
                    'On mobile, tilt or drag to move'
                ],
                tip: 'Prioritise gold bonus cards when they appear.'
            },
            onUpdate: onUpdate,
            onDraw: onDraw,
            onGameOver: onGameOver,
            onReset: function () {
                reset();
            },
            onInit: function () {
                reset();
                setupGameInput();
                gameActive = true;
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
