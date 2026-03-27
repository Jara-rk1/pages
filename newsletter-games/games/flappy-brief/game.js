/**
 * Flappy Brief — KPMG Newsletter Minigame
 * Navigate a briefcase through regulation walls.
 */
(function () {
    'use strict';

    const GAME_ID = 'flappy-brief';
    const W = 400;
    const H = 700;
    const GRAVITY = 1200;
    const FLAP_FORCE = -420;
    const PIPE_SPEED_BASE = 180;
    const PIPE_GAP = 160;
    const PIPE_WIDTH = 60;
    const PIPE_INTERVAL = 220;

    const REGULATIONS = [
        'IFRS 16', 'ASX CGS', 'APRA CPS 230', 'ASIC RG 271',
        'SOX 404', 'PCAOB AS 2201', 'AASB 15', 'GDPR Art 30'
    ];

    /* ---- state ---- */
    let bird, pipes, nextPipeX, regIndex, pipeSpeed, score, dead;

    function reset() {
        bird = { x: 100, y: 350, vy: 0, w: 36, h: 28 };
        pipes = [];
        nextPipeX = W + 80;
        regIndex = 0;
        score = 0;
        pipeSpeed = PIPE_SPEED_BASE;
        dead = false;
        GameEngine.state.score = 0;
    }

    /* ---- pipe spawning ---- */
    function spawnPipe() {
        const minGapY = H * 0.2 + PIPE_GAP / 2;
        const maxGapY = H * 0.8 - PIPE_GAP / 2;
        const gapY = GameEngine.randomBetween(minGapY, maxGapY);
        const label = REGULATIONS[regIndex % REGULATIONS.length];
        regIndex++;
        pipes.push({ x: nextPipeX, gapY: gapY, passed: false, label: label });
        nextPipeX += PIPE_INTERVAL + PIPE_WIDTH;
    }

    /* ---- flap ---- */
    function flap() {
        if (dead) return;
        bird.vy = FLAP_FORCE;
    }

    function setupGameInput() {
        GameEngine.setupInput({
            onTap: function () { flap(); },
            onKey: function (key) {
                if (key === ' ' || key === 'ArrowUp' || key === 'w' || key === 'W') {
                    flap();
                }
            }
        });
    }

    /* ---- update ---- */
    function update(dt) {
        if (dead) return;

        bird.vy += GRAVITY * dt;
        bird.y += bird.vy * dt;

        if (bird.y < 0) {
            bird.y = 0;
            bird.vy = 0;
        }
        if (bird.y + bird.h > H) {
            die();
            return;
        }

        pipeSpeed = PIPE_SPEED_BASE + Math.floor(score / 10) * 15;

        for (let i = pipes.length - 1; i >= 0; i--) {
            const p = pipes[i];
            p.x -= pipeSpeed * dt;

            if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
                p.passed = true;
                score++;
                GameEngine.state.score = score;
            }

            if (p.x + PIPE_WIDTH < -10) {
                pipes.splice(i, 1);
            }
        }

        const lastPipeX = pipes.length > 0 ? pipes[pipes.length - 1].x : 0;
        while (lastPipeX < W + PIPE_INTERVAL || pipes.length === 0) {
            spawnPipe();
            break;
        }
        if (pipes.length > 0) {
            const furthest = pipes[pipes.length - 1].x;
            if (furthest < W + 20) {
                spawnPipe();
            }
        }

        const birdRect = { x: bird.x, y: bird.y, w: bird.w, h: bird.h };
        for (const p of pipes) {
            const topWall = { x: p.x, y: 0, w: PIPE_WIDTH, h: p.gapY - PIPE_GAP / 2 };
            const botWall = { x: p.x, y: p.gapY + PIPE_GAP / 2, w: PIPE_WIDTH, h: H - (p.gapY + PIPE_GAP / 2) };

            if (GameEngine.collisionRect(birdRect, topWall) || GameEngine.collisionRect(birdRect, botWall)) {
                die();
                return;
            }
        }
    }

    function die() {
        if (dead) return;
        dead = true;
        GameEngine.endGame();
    }

    /* ---- draw ---- */
    function draw(ctx) {
        const w = W;
        const h = H;

        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = KPMG.colours.border;
        ctx.lineWidth = 0.5;
        for (let gx = 0; gx < w; gx += 40) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
        }
        for (let gy = 0; gy < h; gy += 40) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        for (const p of pipes) {
            const topH = p.gapY - PIPE_GAP / 2;
            const botY = p.gapY + PIPE_GAP / 2;

            ctx.fillStyle = KPMG.colours.blue;
            ctx.fillRect(p.x, 0, PIPE_WIDTH, topH);
            ctx.fillRect(p.x, botY, PIPE_WIDTH, h - botY);

            const capH = 12;
            const capExtend = 4;
            ctx.fillStyle = KPMG.colours.cobalt;
            ctx.fillRect(p.x - capExtend, topH - capH, PIPE_WIDTH + capExtend * 2, capH);
            ctx.fillRect(p.x - capExtend, botY, PIPE_WIDTH + capExtend * 2, capH);

            ctx.save();
            ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(p.label, p.x + PIPE_WIDTH / 2, topH - capH - 4);
            ctx.restore();

            ctx.save();
            ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(p.label, p.x + PIPE_WIDTH / 2, botY + capH + 4);
            ctx.restore();
        }

        drawBriefcase(ctx, bird.x, bird.y, bird.w, bird.h, bird.vy);

        ctx.save();
        ctx.font = 'bold 48px Arial, Helvetica, sans-serif';
        ctx.fillStyle = 'rgba(0, 51, 141, 0.15)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(score, w / 2, 70);
        ctx.restore();
    }

    function drawBriefcase(ctx, x, y, w, h, vy) {
        ctx.save();

        const angle = GameEngine.clamp(vy / 600, -0.4, 0.6);
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(angle);

        const bw = w;
        const bh = h * 0.7;
        ctx.fillStyle = '#8B4513';
        GameEngine.drawRoundedRect(ctx, -bw / 2, -bh / 2 + 2, bw, bh, 3);
        ctx.fill();

        ctx.fillStyle = '#6B3410';
        ctx.fillRect(-bw / 2, -1, bw, 3);

        ctx.strokeStyle = '#5A2D0C';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, -bh / 2 - 1, 6, Math.PI, 0);
        ctx.stroke();

        ctx.fillStyle = '#DAA520';
        ctx.fillRect(-3, -3, 6, 4);

        ctx.restore();
    }

    /* ---- game over callback ---- */
    function onGameOver(finalScore) {
        // Nothing extra needed; GameEngine handles overlay
    }

    /* ---- init ---- */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 480 });

        GameEngine.startGame(GAME_ID, {
            onUpdate: update,
            onDraw: draw,
            onGameOver: onGameOver,
            onReset: function () {
                reset();
            },
            onInit: function () {
                reset();
                setupGameInput();
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
