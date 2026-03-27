/**
 * Consultant Rush — Endless Runner (Subway Surfers style)
 * Dodge office obstacles, collect bonuses, survive as long as possible.
 */

(function () {
    'use strict';

    const GAME_ID = 'consultant-rush';
    const W = 400;
    const H = 700;

    // Lane geometry
    const LANE_MARGIN = 20;
    const LANE_WIDTH = 120;
    const LANE_COUNT = 3;
    const LANE_CENTRES = [
        LANE_MARGIN + LANE_WIDTH / 2,
        LANE_MARGIN + LANE_WIDTH + LANE_WIDTH / 2,
        LANE_MARGIN + LANE_WIDTH * 2 + LANE_WIDTH / 2
    ];

    // Player
    const PLAYER_Y = H - 120;
    const PLAYER_HEAD_R = 14;
    const PLAYER_BODY_W = 28;
    const PLAYER_BODY_H = 40;
    const LANE_SWITCH_DURATION = 0.15;

    // Speed
    const BASE_SPEED = 300;
    const SPEED_CAP = 600;
    const SPEED_RAMP = 10;

    // Spawning
    const SPAWN_ZONE_TOP = -80;
    const MIN_OBSTACLE_GAP = 250;

    // Obstacle types
    const OBSTACLE_TYPES = [
        { label: '\u{1F4C5}', name: 'Meeting', colour: KPMG.colours.purple, w: 60, h: 50 },
        { label: '\u{1F5A8}\uFE0F', name: 'Printer Jam', colour: KPMG.colours.mid, w: 55, h: 45 },
        { label: '\u2615', name: 'Coffee Spill', colour: '#8B4513', w: 40, h: 40, round: true },
        { label: '\u{1F4DA}', name: 'Binders', colour: KPMG.colours.lightBlue, w: 50, h: 55 }
    ];

    // Collectible types
    const COLLECTIBLE_TYPES = [
        { label: '\u2605', name: 'Client Logo', colour: '#FFD700', r: 18, points: 100 },
        { label: '\u2615', name: 'Coffee', colour: '#8B4513', r: 14, points: 50 },
        { label: '\u{1F4BC}', name: 'Briefcase', colour: KPMG.colours.cobalt, r: 20, points: 500, rare: true }
    ];

    // ---- State ----
    let playerLane, playerX, targetX;
    let obstacles, collectibles, particles;
    let speed, timeSurvived, scoreTimer, bonusScore;
    let spawnAccum, collectibleAccum, floorScroll;
    let gameActive;

    function reset() {
        playerLane = 1;
        playerX = LANE_CENTRES[1];
        targetX = LANE_CENTRES[1];
        obstacles = [];
        collectibles = [];
        particles = [];
        speed = BASE_SPEED;
        timeSurvived = 0;
        scoreTimer = 0;
        bonusScore = 0;
        spawnAccum = 0;
        collectibleAccum = 0;
        floorScroll = 0;
        gameActive = false;
    }

    function switchLane(dir) {
        if (!gameActive) return;
        const newLane = GameEngine.clamp(playerLane + dir, 0, LANE_COUNT - 1);
        if (newLane !== playerLane) {
            playerLane = newLane;
            targetX = LANE_CENTRES[playerLane];
        }
    }

    function setupGameInput() {
        GameEngine.setupInput({
            onSwipeLeft: function () { switchLane(-1); },
            onSwipeRight: function () { switchLane(1); },
            onKey: function (key) {
                if (key === 'ArrowLeft') switchLane(-1);
                if (key === 'ArrowRight') switchLane(1);
            }
        });
    }

    // ---- Spawning ----
    function spawnObstacle() {
        const blockCount = Math.random() < 0.25 ? 2 : 1;
        const lanes = [0, 1, 2];
        const blocked = [];
        for (let i = 0; i < blockCount; i++) {
            const idx = Math.floor(Math.random() * lanes.length);
            blocked.push(lanes.splice(idx, 1)[0]);
        }

        for (const lane of blocked) {
            const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
            obstacles.push({
                x: LANE_CENTRES[lane],
                y: SPAWN_ZONE_TOP,
                w: type.w,
                h: type.h,
                colour: type.colour,
                label: type.label,
                round: type.round || false
            });
        }
    }

    function spawnCollectible() {
        const lane = Math.floor(Math.random() * LANE_COUNT);
        const hasObstacle = obstacles.some(o =>
            Math.abs(LANE_CENTRES[lane] - o.x) < 30 && o.y < SPAWN_ZONE_TOP + 60
        );
        if (hasObstacle) return;

        let typeIdx;
        if (Math.random() < 0.10) {
            typeIdx = 2;
        } else if (Math.random() < 0.5) {
            typeIdx = 0;
        } else {
            typeIdx = 1;
        }
        const type = COLLECTIBLE_TYPES[typeIdx];

        collectibles.push({
            x: LANE_CENTRES[lane],
            y: SPAWN_ZONE_TOP,
            r: type.r,
            colour: type.colour,
            label: type.label,
            points: type.points
        });
    }

    // ---- Update ----
    function update(dt) {
        if (!gameActive) return;

        timeSurvived += dt;

        speed = Math.min(SPEED_CAP, BASE_SPEED + Math.floor(timeSurvived / 5) * SPEED_RAMP);

        const lerpSpeed = 1 - Math.pow(0.001, dt);
        playerX = GameEngine.lerp(playerX, targetX, lerpSpeed);

        scoreTimer += dt;
        while (scoreTimer >= 0.1) {
            scoreTimer -= 0.1;
            GameEngine.state.score = Math.floor(timeSurvived * 10) + bonusScore;
        }

        floorScroll = (floorScroll + speed * dt) % 40;

        spawnAccum += speed * dt;
        if (spawnAccum >= MIN_OBSTACLE_GAP) {
            spawnAccum -= MIN_OBSTACLE_GAP;
            spawnObstacle();
        }

        collectibleAccum += speed * dt;
        if (collectibleAccum >= 350) {
            collectibleAccum -= 350;
            if (Math.random() < 0.6) spawnCollectible();
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            obstacles[i].y += speed * dt;
            if (obstacles[i].y > H + 100) {
                obstacles.splice(i, 1);
            }
        }

        for (let i = collectibles.length - 1; i >= 0; i--) {
            collectibles[i].y += speed * dt;
            if (collectibles[i].y > H + 100) {
                collectibles.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.age += dt;
            if (p.age > p.life) {
                particles.splice(i, 1);
            }
        }

        const playerRect = {
            x: playerX - PLAYER_BODY_W / 2,
            y: PLAYER_Y - PLAYER_HEAD_R,
            w: PLAYER_BODY_W,
            h: PLAYER_HEAD_R * 2 + PLAYER_BODY_H
        };

        for (const obs of obstacles) {
            const obsRect = {
                x: obs.x - obs.w / 2,
                y: obs.y - obs.h / 2,
                w: obs.w,
                h: obs.h
            };
            if (GameEngine.collisionRect(playerRect, obsRect)) {
                gameActive = false;
                GameEngine.state.score = Math.floor(timeSurvived * 10) + bonusScore;
                GameEngine.endGame();
                return;
            }
        }

        for (let i = collectibles.length - 1; i >= 0; i--) {
            const c = collectibles[i];
            const dist = Math.sqrt(
                Math.pow(playerX - c.x, 2) + Math.pow(PLAYER_Y - c.y, 2)
            );
            if (dist < c.r + 20) {
                bonusScore += c.points;
                for (let p = 0; p < 8; p++) {
                    const angle = (Math.PI * 2 / 8) * p;
                    particles.push({
                        x: c.x, y: c.y,
                        vx: Math.cos(angle) * 100,
                        vy: Math.sin(angle) * 100,
                        colour: c.colour,
                        age: 0, life: 0.5
                    });
                }
                collectibles.splice(i, 1);
            }
        }

        GameEngine.state.score = Math.floor(timeSurvived * 10) + bonusScore;
    }

    // ---- Draw ----
    function draw(ctx) {
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(0, 0, LANE_MARGIN - 5, H);
        ctx.fillRect(W - LANE_MARGIN + 5, 0, LANE_MARGIN - 5, H);

        ctx.fillStyle = KPMG.colours.blue;
        ctx.fillRect(LANE_MARGIN - 5, 0, 3, H);
        ctx.fillRect(W - LANE_MARGIN + 2, 0, 3, H);

        ctx.strokeStyle = '#D5D5D5';
        ctx.lineWidth = 1;
        for (let ty = -40 + floorScroll; ty < H + 40; ty += 40) {
            ctx.beginPath();
            ctx.moveTo(LANE_MARGIN, ty);
            ctx.lineTo(W - LANE_MARGIN, ty);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);
        for (let l = 1; l < LANE_COUNT; l++) {
            const lx = LANE_MARGIN + l * LANE_WIDTH;
            ctx.beginPath();
            ctx.moveTo(lx, 0);
            ctx.lineTo(lx, H);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        for (const c of collectibles) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.fillStyle = c.colour;
            ctx.globalAlpha = 0.85;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.font = Math.round(c.r * 1.2) + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(c.label, c.x, c.y);
            ctx.restore();
        }

        for (const obs of obstacles) {
            ctx.save();
            if (obs.round) {
                ctx.beginPath();
                ctx.arc(obs.x, obs.y, obs.w / 2, 0, Math.PI * 2);
                ctx.fillStyle = obs.colour;
                ctx.fill();
            } else {
                ctx.fillStyle = obs.colour;
                GameEngine.drawRoundedRect(ctx, obs.x - obs.w / 2, obs.y - obs.h / 2, obs.w, obs.h, 6);
                ctx.fill();
            }
            ctx.font = '22px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(obs.label, obs.x, obs.y);
            ctx.restore();
        }

        for (const p of particles) {
            const alpha = 1 - p.age / p.life;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.colour;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        drawPlayer(ctx, playerX, PLAYER_Y);

        ctx.save();
        ctx.font = KPMG.fonts.small;
        ctx.fillStyle = KPMG.colours.mid;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Speed: ' + Math.round(speed) + ' px/s', LANE_MARGIN + 4, GameEngine.HUD_HEIGHT + 6);
        ctx.restore();
    }

    function drawPlayer(ctx, x, y) {
        ctx.save();

        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.ellipse(x, y + PLAYER_BODY_H + 5, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = KPMG.colours.dark;
        GameEngine.drawRoundedRect(ctx, x - PLAYER_BODY_W / 2, y, PLAYER_BODY_W, PLAYER_BODY_H, 4);
        ctx.fill();

        ctx.fillStyle = KPMG.colours.pacific;
        ctx.beginPath();
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x - 4, y + 16);
        ctx.lineTo(x, y + 20);
        ctx.lineTo(x + 4, y + 16);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#F5CBA7';
        ctx.beginPath();
        ctx.arc(x, y - PLAYER_HEAD_R + 2, PLAYER_HEAD_R, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = KPMG.colours.blue;
        ctx.beginPath();
        ctx.arc(x, y - PLAYER_HEAD_R, PLAYER_HEAD_R, Math.PI, 0);
        ctx.fill();

        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x + PLAYER_BODY_W / 2 - 2, y + PLAYER_BODY_H - 12, 12, 10);
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(x + PLAYER_BODY_W / 2 + 2, y + PLAYER_BODY_H - 10, 4, 2);

        ctx.restore();
    }

    // ---- Init ----
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H });

        GameEngine.startGame(GAME_ID, {
            onUpdate: update,
            onDraw: draw,
            onGameOver: function () {
                gameActive = false;
            },
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
