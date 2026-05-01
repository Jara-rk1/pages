/**
 * Budget Blitz — Whack-a-Mole style game
 * Tap budget overruns before they pop!
 */
(function () {
    'use strict';

    const GAME_ID = 'budget-blitz';
    const W = 400;
    const H = 600;
    const HUD_H = GameEngine.HUD_HEIGHT;

    // Grid layout
    const COLS = 4;
    const ROWS = 4;
    const CELL_GAP = 10;
    const HEADER_ROW_H = 28;
    const ROW_NUM_W = 28;
    const GRID_TOP = HUD_H + 50; // space for budget bar
    const GRID_LEFT = ROW_NUM_W + 8;
    const GRID_W = W - GRID_LEFT - 8;
    const GRID_H = H - GRID_TOP - 20;
    const CELL_W = (GRID_W - (COLS - 1) * CELL_GAP) / COLS;
    const CELL_H = (GRID_H - HEADER_ROW_H - (ROWS - 1) * CELL_GAP) / ROWS;

    // Budget bar
    const BUDGET_MAX = 10000000; // $10M
    const BUDGET_DRAIN = 500000; // $500K per miss
    const BAR_Y = HUD_H + 8;
    const BAR_H = 28;
    const BAR_X = 12;
    const BAR_W = W - 24;

    // Bubble labels
    const LABELS = [
        'Scope change', 'Overtime', 'Travel', 'Rework',
        'Vendor', 'Delay', 'Agency', 'Compliance'
    ];

    // Game round
    const ROUND_DURATION = 60; // seconds

    // State
    let budget = BUDGET_MAX;
    let bubbles = [];
    let particles = [];
    let elapsed = 0;
    let spawnTimer = 0;
    let labelIndex = 0;
    let gameActive = false;

    function reset() {
        budget = BUDGET_MAX;
        bubbles = [];
        particles = [];
        elapsed = 0;
        spawnTimer = 0.5;
        labelIndex = 0;
        gameActive = false;
    }

    function getCellPos(col, row) {
        return {
            x: GRID_LEFT + col * (CELL_W + CELL_GAP),
            y: GRID_TOP + HEADER_ROW_H + row * (CELL_H + CELL_GAP)
        };
    }

    function getSpawnInterval() {
        const t = Math.min(elapsed / ROUND_DURATION, 1);
        return GameEngine.lerp(1.2, 0.4, t);
    }

    function getBubbleLifetime() {
        const t = Math.min(elapsed / ROUND_DURATION, 1);
        return GameEngine.lerp(1.5, 0.8, t);
    }

    function getMaxSimultaneous() {
        if (elapsed < 15) return 1;
        if (elapsed < 30) return 2;
        return 3;
    }

    function spawnBubble() {
        if (bubbles.length >= getMaxSimultaneous()) return;

        const occupied = new Set(bubbles.map(b => b.col + ',' + b.row));
        const free = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!occupied.has(c + ',' + r)) {
                    free.push({ col: c, row: r });
                }
            }
        }
        if (free.length === 0) return;

        const cell = free[GameEngine.randomInt(0, free.length - 1)];
        const pos = getCellPos(cell.col, cell.row);
        const lifetime = getBubbleLifetime();

        bubbles.push({
            col: cell.col,
            row: cell.row,
            x: pos.x + CELL_W / 2,
            y: pos.y + CELL_H / 2,
            age: 0,
            lifetime: lifetime,
            maxRadius: Math.min(CELL_W, CELL_H) / 2 - 6,
            label: LABELS[labelIndex % LABELS.length],
            popping: false,
            popTimer: 0,
            squashed: false,
            squashTimer: 0
        });
        labelIndex++;
    }

    function addSquashParticles(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.3;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * GameEngine.randomBetween(40, 100),
                vy: Math.sin(angle) * GameEngine.randomBetween(40, 100),
                life: 0.5,
                maxLife: 0.5,
                color: KPMG.colours.green,
                radius: GameEngine.randomBetween(3, 6)
            });
        }
    }

    function addPopParticles(x, y) {
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 / 6) * i;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * GameEngine.randomBetween(30, 70),
                vy: Math.sin(angle) * GameEngine.randomBetween(30, 70),
                life: 0.4,
                maxLife: 0.4,
                color: KPMG.colours.red,
                radius: GameEngine.randomBetween(2, 5)
            });
        }
    }

    function getBudgetColor() {
        const pct = budget / BUDGET_MAX;
        if (pct > 0.5) return KPMG.colours.green;
        if (pct > 0.25) return KPMG.colours.amber;
        return KPMG.colours.red;
    }

    // --- Callbacks ---
    function onUpdate(dt) {
        if (!gameActive) return;

        elapsed += dt;

        if (elapsed >= ROUND_DURATION || budget <= 0) {
            gameActive = false;
            GameEngine.endGame();
            return;
        }

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            spawnBubble();
            spawnTimer = getSpawnInterval();
        }

        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];

            if (b.squashed) {
                b.squashTimer += dt;
                if (b.squashTimer > 0.3) {
                    bubbles.splice(i, 1);
                }
                continue;
            }

            if (b.popping) {
                b.popTimer += dt;
                if (b.popTimer > 0.4) {
                    bubbles.splice(i, 1);
                }
                continue;
            }

            b.age += dt;
            if (b.age >= b.lifetime) {
                b.popping = true;
                b.popTimer = 0;
                budget = Math.max(0, budget - BUDGET_DRAIN);
                addPopParticles(b.x, b.y);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function onDraw(ctx) {
        ctx.fillStyle = '#F0F0F0';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = KPMG.colours.border;
        GameEngine.drawRoundedRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, 4);
        ctx.fill();

        const pct = budget / BUDGET_MAX;
        if (pct > 0) {
            ctx.fillStyle = getBudgetColor();
            GameEngine.drawRoundedRect(ctx, BAR_X, BAR_Y, BAR_W * pct, BAR_H, 4);
            ctx.fill();
        }

        ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillStyle = pct > 0.4 ? KPMG.colours.white : KPMG.colours.dark;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const budgetStr = '$' + (budget / 1000000).toFixed(1) + 'M / $10.0M';
        ctx.fillText(budgetStr, W / 2, BAR_Y + BAR_H / 2);

        const timeLeft = Math.max(0, Math.ceil(ROUND_DURATION - elapsed));
        ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.dark;
        ctx.textAlign = 'right';
        ctx.fillText(timeLeft + 's', W - 14, BAR_Y + BAR_H / 2);

        ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.blue;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const colLabels = ['A', 'B', 'C', 'D'];
        for (let c = 0; c < COLS; c++) {
            const x = GRID_LEFT + c * (CELL_W + CELL_GAP) + CELL_W / 2;
            ctx.fillText(colLabels[c], x, GRID_TOP + HEADER_ROW_H / 2);
        }

        ctx.textAlign = 'center';
        for (let r = 0; r < ROWS; r++) {
            const y = GRID_TOP + HEADER_ROW_H + r * (CELL_H + CELL_GAP) + CELL_H / 2;
            ctx.fillText('' + (r + 1), GRID_LEFT / 2, y);
        }

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const pos = getCellPos(c, r);
                ctx.fillStyle = KPMG.colours.white;
                ctx.strokeStyle = KPMG.colours.border;
                ctx.lineWidth = 1;
                GameEngine.drawRoundedRect(ctx, pos.x, pos.y, CELL_W, CELL_H, 4);
                ctx.fill();
                ctx.stroke();
            }
        }

        for (const b of bubbles) {
            ctx.save();

            if (b.squashed) {
                const t = b.squashTimer / 0.3;
                const scale = 1 - t;
                ctx.translate(b.x, b.y);
                ctx.scale(scale, scale);
                ctx.globalAlpha = 1 - t;

                const radius = b.maxRadius;
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fillStyle = KPMG.colours.green;
                ctx.fill();

                ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
                ctx.fillStyle = KPMG.colours.white;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+100', 0, 0);
            } else if (b.popping) {
                const t = b.popTimer / 0.4;
                const scale = 1 + t * 0.5;
                ctx.translate(b.x, b.y);
                ctx.scale(scale, scale);
                ctx.globalAlpha = 1 - t;

                const radius = b.maxRadius;
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fillStyle = KPMG.colours.red;
                ctx.fill();
            } else {
                const growPct = Math.min(b.age / b.lifetime, 1);
                const radius = b.maxRadius * growPct;

                let pulseOffset = 0;
                if (growPct > 0.7) {
                    pulseOffset = Math.sin(b.age * 12) * 3;
                }

                ctx.beginPath();
                ctx.arc(b.x, b.y, radius + pulseOffset, 0, Math.PI * 2);

                const redVal = Math.floor(GameEngine.lerp(255, 200, growPct));
                ctx.fillStyle = `rgb(${redVal}, ${Math.floor(40 - growPct * 20)}, ${Math.floor(40 - growPct * 20)})`;
                ctx.fill();

                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 2;
                ctx.stroke();

                if (radius > 15) {
                    ctx.font = 'bold ' + Math.min(10, Math.floor(radius * 0.4)) + 'px Arial, Helvetica, sans-serif';
                    ctx.fillStyle = KPMG.colours.white;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(b.label, b.x, b.y);
                }
            }

            ctx.restore();
        }

        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * (p.life / p.maxLife), 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.restore();
        }
    }

    function onTap(x, y) {
        if (!gameActive) return;

        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            if (b.squashed || b.popping) continue;

            const growPct = Math.min(b.age / b.lifetime, 1);

            const pos = getCellPos(b.col, b.row);
            if (x >= pos.x && x <= pos.x + CELL_W && y >= pos.y && y <= pos.y + CELL_H) {
                b.squashed = true;
                b.squashTimer = 0;

                let pts = 100;
                if (growPct < 0.5) pts += 50;
                GameEngine.state.score += pts;

                addSquashParticles(b.x, b.y);
                return;
            }
        }
    }

    function onGameOver(score) {
        gameActive = false;
    }

    function setupGameInput() {
        GameEngine.setupInput({
            onTap: onTap
        });
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
                objective: 'Budget overruns pop up across the grid — tap them before they expire! Miss too many and the budget blows out.',
                controls: [
                    'Click or tap the highlighted cells to squash overruns'
                ],
                tip: 'Watch for cells that flash faster — they disappear quickly!'
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
                // gameActive set to true AFTER countdown finishes (engine handles countdown before onInit)
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
