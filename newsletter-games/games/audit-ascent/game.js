/**
 * Audit Ascent — Jetpack Side-Scroller
 * Hold tap/click/space to rise, release to fall. Dodge red-flag line items, collect checkmarks and seals.
 */
(function () {
    'use strict';

    const GAME_ID = 'audit-ascent';
    const W = 480;
    const H = 400;
    const HUD = GameEngine.HUD_HEIGHT;
    const PLAY_TOP = HUD;
    const PLAY_H = H - HUD;

    /* --- Physics --- */
    const GRAVITY = 600;
    const THRUST = -420;
    const PLAYER_X = 80;
    const PLAYER_W = 24;
    const PLAYER_H = 32;
    const HEAD_R = 10;

    /* --- Obstacle labels --- */
    const FLAG_LABELS = ['Overstatement', 'Missing docs', 'Fraud risk', 'Variance', 'Misclass.', 'Unreconciled'];

    /* --- Game state --- */
    let player, obstacles, collectibles, particles, bgElements;
    let scrollSpeed, speedTimer, totalDist, thrusting, shieldTimer;
    let lastObstacleX, lastCollectibleX, lastSealTime, lastShieldTime, gameTime;
    let keysDown;

    function reset() {
        player = { x: PLAYER_X, y: PLAY_TOP + PLAY_H / 2, vy: 0 };
        obstacles = [];
        collectibles = [];
        particles = [];
        bgElements = generateBgElements();
        scrollSpeed = 200;
        speedTimer = 0;
        totalDist = 0;
        thrusting = false;
        shieldTimer = 0;
        lastObstacleX = W + 100;
        lastCollectibleX = W;
        lastSealTime = 0;
        lastShieldTime = 0;
        gameTime = 0;
        keysDown = {};
    }

    /* --- Background: faint spreadsheet lines and numbers --- */
    function generateBgElements() {
        const els = [];
        for (let i = 0; i < 30; i++) {
            els.push({
                x: Math.random() * W * 2,
                y: PLAY_TOP + Math.random() * PLAY_H,
                text: Math.random() < 0.5
                    ? (Math.random() * 10000).toFixed(2)
                    : ['Rev', 'Exp', 'Dep', 'Acc', 'Bal', 'Net', 'Adj'][Math.floor(Math.random() * 7)],
                speed: 0.3 + Math.random() * 0.4
            });
        }
        return els;
    }

    /* --- Spawn helpers --- */
    function spawnObstacle() {
        const gapSize = GameEngine.randomBetween(150, 250);
        const gapY = GameEngine.randomBetween(PLAY_TOP + 40, PLAY_TOP + PLAY_H - gapSize - 40);
        const barW = GameEngine.randomBetween(100, 200);
        const label = FLAG_LABELS[GameEngine.randomInt(0, FLAG_LABELS.length - 1)];

        obstacles.push({ x: lastObstacleX, y: PLAY_TOP, w: barW, h: gapY - PLAY_TOP, label: label });
        const bottomY = gapY + gapSize;
        obstacles.push({ x: lastObstacleX, y: bottomY, w: barW, h: PLAY_TOP + PLAY_H - bottomY, label: label });

        collectibles.push({
            x: lastObstacleX + barW / 2,
            y: gapY + gapSize / 2,
            type: 'check',
            r: 8,
            collected: false
        });

        lastObstacleX += barW + GameEngine.randomBetween(200, 350);
    }

    function spawnSeal() {
        collectibles.push({
            x: W + 20,
            y: GameEngine.randomBetween(PLAY_TOP + 30, PLAY_TOP + PLAY_H - 30),
            type: 'seal',
            r: 12,
            collected: false
        });
    }

    function spawnShield() {
        collectibles.push({
            x: W + 20,
            y: GameEngine.randomBetween(PLAY_TOP + 30, PLAY_TOP + PLAY_H - 30),
            type: 'shield',
            r: 10,
            collected: false
        });
    }

    /* --- Particle system --- */
    function emitJetParticles() {
        for (let i = 0; i < 2; i++) {
            particles.push({
                x: player.x - PLAYER_W / 2,
                y: player.y + GameEngine.randomBetween(-4, 4),
                vx: GameEngine.randomBetween(-80, -40),
                vy: GameEngine.randomBetween(-20, 20),
                life: 0.4,
                maxLife: 0.4,
                r: GameEngine.randomBetween(2, 5),
                color: Math.random() < 0.5 ? KPMG.colours.pacific : KPMG.colours.lightBlue
            });
        }
    }

    /* --- Input handling --- */
    function setupGameInput() {
        const onKeyDown = (e) => {
            if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                e.preventDefault();
                keysDown[e.key] = true;
            }
        };
        const onKeyUp = (e) => {
            delete keysDown[e.key];
        };
        const onPointerDown = (e) => { keysDown['_pointer'] = true; };
        const onPointerUp = (e) => { delete keysDown['_pointer']; };
        const onTouchStart = (e) => { keysDown['_pointer'] = true; };
        const onTouchEnd = (e) => { delete keysDown['_pointer']; };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        GameEngine.canvas.addEventListener('pointerdown', onPointerDown);
        GameEngine.canvas.addEventListener('pointerup', onPointerUp);
        GameEngine.canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        GameEngine.canvas.addEventListener('touchend', onTouchEnd);

        GameEngine._inputCleanup = () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            GameEngine.canvas.removeEventListener('pointerdown', onPointerDown);
            GameEngine.canvas.removeEventListener('pointerup', onPointerUp);
            GameEngine.canvas.removeEventListener('touchstart', onTouchStart);
            GameEngine.canvas.removeEventListener('touchend', onTouchEnd);
        };
    }

    /* --- Update --- */
    function onUpdate(dt) {
        gameTime += dt;

        thrusting = Object.keys(keysDown).length > 0;

        if (thrusting) {
            player.vy += THRUST * dt;
            emitJetParticles();
        }
        player.vy += GRAVITY * dt;
        player.vy = GameEngine.clamp(player.vy, -400, 400);
        player.y += player.vy * dt;

        speedTimer += dt;
        if (speedTimer >= 10) {
            speedTimer -= 10;
            scrollSpeed = Math.min(scrollSpeed + 20, 500);
        }

        const scrollDist = scrollSpeed * dt;
        totalDist += scrollDist;

        GameEngine.state.score = Math.floor(totalDist / 10);

        if (shieldTimer > 0) {
            shieldTimer -= dt;
            if (shieldTimer < 0) shieldTimer = 0;
        }

        if (lastObstacleX - totalDist < W + 100) {
            spawnObstacle();
        }

        if (gameTime - lastSealTime > 20) {
            lastSealTime = gameTime;
            spawnSeal();
        }

        if (gameTime - lastShieldTime > 30) {
            lastShieldTime = gameTime;
            spawnShield();
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            obstacles[i].x -= scrollDist;
            if (obstacles[i].x + obstacles[i].w < -10) {
                obstacles.splice(i, 1);
            }
        }

        for (let i = collectibles.length - 1; i >= 0; i--) {
            const c = collectibles[i];
            c.x -= scrollDist;
            if (c.x < -20) {
                collectibles.splice(i, 1);
                continue;
            }
            if (c.collected) continue;

            const dx = player.x - c.x;
            const dy = player.y - c.y;
            if (Math.sqrt(dx * dx + dy * dy) < c.r + 14) {
                c.collected = true;
                if (c.type === 'check') {
                    GameEngine.state.score += 100;
                } else if (c.type === 'seal') {
                    GameEngine.state.score += 500;
                } else if (c.type === 'shield') {
                    shieldTimer = 3;
                }
            }
        }

        for (const bg of bgElements) {
            bg.x -= scrollDist * bg.speed;
            if (bg.x < -60) bg.x += W + 120;
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

        if (player.y - HEAD_R < PLAY_TOP || player.y + PLAYER_H / 2 > PLAY_TOP + PLAY_H) {
            if (shieldTimer <= 0) {
                GameEngine.endGame();
                return;
            }
            player.y = GameEngine.clamp(player.y, PLAY_TOP + HEAD_R, PLAY_TOP + PLAY_H - PLAYER_H / 2);
            player.vy = 0;
        }

        const pRect = {
            x: player.x - PLAYER_W / 2,
            y: player.y - HEAD_R,
            w: PLAYER_W,
            h: PLAYER_H
        };
        for (const obs of obstacles) {
            if (GameEngine.collisionRect(pRect, obs)) {
                if (shieldTimer <= 0) {
                    GameEngine.endGame();
                    return;
                }
            }
        }
    }

    /* --- Draw --- */
    function onDraw(ctx) {
        const w = W;
        const h = H;

        ctx.fillStyle = KPMG.colours.white;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.strokeStyle = '#E5E5E5';
        ctx.lineWidth = 0.5;
        for (let y = PLAY_TOP; y < h; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        for (let x = 0; x < w; x += 60) {
            ctx.beginPath();
            ctx.moveTo(x, PLAY_TOP);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        ctx.font = '10px Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#D0D0D0';
        for (const bg of bgElements) {
            ctx.fillText(bg.text, bg.x, bg.y);
        }
        ctx.restore();

        for (const obs of obstacles) {
            ctx.fillStyle = KPMG.colours.red;
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.save();
            ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelY = GameEngine.clamp(obs.y + obs.h / 2, obs.y + 10, obs.y + obs.h - 10);
            if (obs.h > 20) {
                ctx.fillText(obs.label, obs.x + obs.w / 2, labelY);
            }
            ctx.restore();
        }

        for (const c of collectibles) {
            if (c.collected) continue;
            ctx.save();
            if (c.type === 'check') {
                ctx.fillStyle = KPMG.colours.green;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
                ctx.fillStyle = KPMG.colours.white;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\u2713', c.x, c.y);
            } else if (c.type === 'seal') {
                ctx.fillStyle = KPMG.colours.amber;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
                ctx.fillStyle = KPMG.colours.white;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\u2605', c.x, c.y + 1);
            } else if (c.type === 'shield') {
                ctx.shadowColor = KPMG.colours.pacific;
                ctx.shadowBlur = 12;
                ctx.fillStyle = KPMG.colours.pacific;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
                ctx.fillStyle = KPMG.colours.white;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('M', c.x, c.y + 1);
            }
            ctx.restore();
        }

        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (shieldTimer > 0) {
            ctx.save();
            ctx.strokeStyle = KPMG.colours.pacific;
            ctx.lineWidth = 3;
            ctx.shadowColor = KPMG.colours.pacific;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        ctx.save();
        const px = player.x;
        const py = player.y;

        ctx.fillStyle = KPMG.colours.blue;
        ctx.fillRect(px - 8, py - 2, 16, 20);

        ctx.fillStyle = KPMG.colours.blue;
        ctx.beginPath();
        ctx.arc(px, py - HEAD_R, HEAD_R, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = KPMG.colours.white;
        ctx.beginPath();
        ctx.arc(px + 3, py - HEAD_R - 1, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = KPMG.colours.cobalt;
        ctx.fillRect(px - 14, py, 6, 12);
        ctx.font = 'bold 5px Arial';
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'center';
        ctx.fillText('OK', px - 11, py + 8);

        if (thrusting) {
            ctx.fillStyle = KPMG.colours.pacific;
            ctx.beginPath();
            ctx.moveTo(px - 14, py + 12);
            ctx.lineTo(px - 11, py + 22 + Math.random() * 6);
            ctx.lineTo(px - 8, py + 12);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        if (shieldTimer > 0) {
            ctx.save();
            ctx.font = KPMG.fonts.small;
            ctx.fillStyle = KPMG.colours.pacific;
            ctx.textAlign = 'center';
            ctx.fillText('SHIELD ' + shieldTimer.toFixed(1) + 's', W / 2, PLAY_TOP + 14);
            ctx.restore();
        }
    }

    function onGameOver(score) {
        // No extra logic needed; engine handles overlay
    }

    /* --- Init --- */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 480 });

        GameEngine.startGame(GAME_ID, {
            onUpdate: onUpdate,
            onDraw: onDraw,
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
