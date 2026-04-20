/**
 * Risk Radar — Asteroids/Shield variant
 * Rotate a shield arc around a central radar to deflect incoming risks.
 */
(function () {
    'use strict';

    const GAME_ID = 'risk-radar';
    const W = 400;
    const H = 400;
    const HUD = GameEngine.HUD_HEIGHT;

    /* --- Radar geometry --- */
    const CX = W / 2;
    const CY = HUD + (H - HUD) / 2;
    const RADAR_R = Math.min(W, H - HUD) / 2 - 20;
    const CENTER_R = 30;
    const SHIELD_ARC = Math.PI / 3;
    const SHIELD_THICKNESS = 12;

    /* --- Risk types --- */
    const RISK_TYPES = [
        { label: 'Cyber', color: KPMG.colours.purple, speed: 110, radius: 10, points: 100 },
        { label: 'Reg',   color: KPMG.colours.blue,   speed: 80,  radius: 14, points: 150 },
        { label: 'Ops',   color: KPMG.colours.pacific, speed: 60,  radius: 18, points: 200 },
        { label: 'Rep',   color: KPMG.colours.magenta, speed: 120, radius: 9,  points: 250 },
        { label: 'Fin',   color: KPMG.colours.red,     speed: 140, radius: 11, points: 300 }
    ];

    const MAX_HEALTH = 5;
    const GAME_DURATION = 120;

    /* --- State (closure variables, no globals) --- */
    let shieldAngle, health, risks, flashes, radarAngle, gameTime;
    let spawnInterval, spawnTimer, speedMultiplier;
    let dragging, dragStartAngle;
    let held;       // keyboard held state
    let rotateSpeed; // radians/sec

    function reset() {
        shieldAngle = -Math.PI / 2;
        health = MAX_HEALTH;
        risks = [];
        flashes = [];
        radarAngle = 0;
        gameTime = 0;
        spawnInterval = 2;
        spawnTimer = 0;
        speedMultiplier = 1;
        dragging = false;
        dragStartAngle = 0;
        held = {};
        rotateSpeed = 4;
    }

    /* --- Spawn --- */
    function spawnRisk() {
        const type = RISK_TYPES[GameEngine.randomInt(0, RISK_TYPES.length - 1)];
        const angle = Math.random() * Math.PI * 2;
        const dist = RADAR_R + 20;
        risks.push({
            x: CX + Math.cos(angle) * dist,
            y: CY + Math.sin(angle) * dist,
            angle: angle,
            speed: type.speed * speedMultiplier,
            radius: type.radius,
            color: type.color,
            label: type.label,
            points: type.points,
            alive: true
        });
    }

    /* --- Helpers --- */
    function normalizeAngle(a) {
        while (a < -Math.PI) a += Math.PI * 2;
        while (a > Math.PI) a -= Math.PI * 2;
        return a;
    }

    function pointAngle(x, y) {
        return Math.atan2(y - CY, x - CX);
    }

    function distFromCenter(x, y) {
        const dx = x - CX;
        const dy = y - CY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function isInShieldArc(angle) {
        const diff = normalizeAngle(angle - shieldAngle);
        return Math.abs(diff) < SHIELD_ARC / 2;
    }

    /* --- Input --- */
    function setupGameInput() {
        const onKeyDown = (e) => {
            if (e.key === 'Escape' && GameEngine.state.running && !GameEngine.state.gameOver) {
                GameEngine.state.paused = !GameEngine.state.paused;
                held = {}; // clear held keys on pause toggle
                return;
            }
            if (GameEngine.state.paused || GameEngine.state.gameOver) return;
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                held.left = true;
            }
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                held.right = true;
            }
        };
        const onKeyUp = (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') held.left = false;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') held.right = false;
        };

        const getAngleFromEvent = (e) => {
            const rect = GameEngine.canvas.getBoundingClientRect();
            const scaleX = W / rect.width;
            const scaleY = H / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;
            return pointAngle(mx, my);
        };

        const onPointerDown = (e) => {
            if (GameEngine.state.paused) return;
            dragging = true;
            dragStartAngle = getAngleFromEvent(e);
        };
        const onPointerMove = (e) => {
            if (!dragging || GameEngine.state.paused) return;
            shieldAngle = getAngleFromEvent(e);
        };
        const onPointerUp = () => { dragging = false; };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        GameEngine.canvas.addEventListener('pointerdown', onPointerDown);
        GameEngine.canvas.addEventListener('pointermove', onPointerMove);
        GameEngine.canvas.addEventListener('pointerup', onPointerUp);

        GameEngine._inputCleanup = () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            GameEngine.canvas.removeEventListener('pointerdown', onPointerDown);
            GameEngine.canvas.removeEventListener('pointermove', onPointerMove);
            GameEngine.canvas.removeEventListener('pointerup', onPointerUp);
        };
    }

    /* --- Update --- */
    function onUpdate(dt) {
        gameTime += dt;

        // Keyboard rotation (uses closure variables, not window globals)
        if (held.left) shieldAngle -= rotateSpeed * dt;
        if (held.right) shieldAngle += rotateSpeed * dt;

        // Difficulty scaling
        const t = Math.min(gameTime / GAME_DURATION, 1);
        spawnInterval = GameEngine.lerp(2, 0.5, t);
        speedMultiplier = GameEngine.lerp(1, 2, t);

        // Spawn
        spawnTimer += dt;
        if (spawnTimer >= spawnInterval) {
            spawnTimer -= spawnInterval;
            spawnRisk();
        }

        // Radar sweep
        radarAngle += (Math.PI * 2 / 3) * dt;

        // Move risks
        for (let i = risks.length - 1; i >= 0; i--) {
            const r = risks[i];
            if (!r.alive) continue;

            const dx = CX - r.x;
            const dy = CY - r.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                r.x += (dx / dist) * r.speed * dt;
                r.y += (dy / dist) * r.speed * dt;
            }

            const newDist = distFromCenter(r.x, r.y);

            // Check shield collision
            const riskAngle = pointAngle(r.x, r.y);
            const shieldInner = RADAR_R - SHIELD_THICKNESS - 10;
            if (newDist <= RADAR_R - 5 && newDist >= shieldInner && isInShieldArc(riskAngle)) {
                r.alive = false;
                GameEngine.state.score += r.points;
                flashes.push({ x: r.x, y: r.y, life: 0.3, maxLife: 0.3, color: r.color });
                continue;
            }

            // Check center damage
            if (newDist < CENTER_R + r.radius) {
                r.alive = false;
                health--;
                flashes.push({ x: CX, y: CY, life: 0.4, maxLife: 0.4, color: KPMG.colours.red });
                if (health <= 0) {
                    GameEngine.endGame();
                    return;
                }
                continue;
            }
        }

        // Clean dead risks
        risks = risks.filter(r => r.alive);

        // Update flashes
        for (let i = flashes.length - 1; i >= 0; i--) {
            flashes[i].life -= dt;
            if (flashes[i].life <= 0) flashes.splice(i, 1);
        }

        // Time limit
        if (gameTime >= GAME_DURATION) {
            GameEngine.endGame();
        }
    }

    /* --- Draw --- */
    function onDraw(ctx) {
        ctx.fillStyle = '#0A0A1A';
        ctx.fillRect(0, 0, W, H);

        ctx.save();

        // Concentric rings
        ctx.strokeStyle = 'rgba(0, 192, 174, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(CX, CY, RADAR_R * (i / 3), 0, Math.PI * 2);
            ctx.stroke();
        }

        // Crosshairs
        ctx.strokeStyle = 'rgba(0, 192, 174, 0.08)';
        ctx.beginPath();
        ctx.moveTo(CX - RADAR_R, CY);
        ctx.lineTo(CX + RADAR_R, CY);
        ctx.moveTo(CX, CY - RADAR_R);
        ctx.lineTo(CX, CY + RADAR_R);
        ctx.stroke();

        // Radar sweep
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = KPMG.colours.teal;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.arc(CX, CY, RADAR_R, radarAngle - 0.4, radarAngle);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = KPMG.colours.teal;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(CX + Math.cos(radarAngle) * RADAR_R, CY + Math.sin(radarAngle) * RADAR_R);
        ctx.stroke();
        ctx.restore();

        // Center zone
        ctx.fillStyle = 'rgba(0, 192, 174, 0.08)';
        ctx.beginPath();
        ctx.arc(CX, CY, CENTER_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 192, 174, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Outer ring
        ctx.strokeStyle = 'rgba(0, 192, 174, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(CX, CY, RADAR_R, 0, Math.PI * 2);
        ctx.stroke();

        // Shield arc
        ctx.save();
        ctx.strokeStyle = KPMG.colours.pacific;
        ctx.lineWidth = SHIELD_THICKNESS;
        ctx.lineCap = 'round';
        ctx.shadowColor = KPMG.colours.pacific;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(CX, CY, RADAR_R - SHIELD_THICKNESS / 2 - 2, shieldAngle - SHIELD_ARC / 2, shieldAngle + SHIELD_ARC / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Risks
        for (const r of risks) {
            if (!r.alive) continue;
            ctx.save();
            ctx.fillStyle = r.color;
            ctx.shadowColor = r.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.font = 'bold 8px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(r.label, r.x, r.y);
            ctx.restore();
        }

        // Flashes
        for (const f of flashes) {
            const alpha = f.life / f.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = f.color;
            ctx.shadowColor = f.color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(f.x, f.y, 15 * (1 - alpha) + 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Health hearts
        const heartY = HUD + 8;
        ctx.font = '14px Arial';
        ctx.textAlign = 'right';
        for (let i = 0; i < MAX_HEALTH; i++) {
            ctx.fillStyle = i < health ? KPMG.colours.red : 'rgba(255,255,255,0.15)';
            ctx.fillText('\u2665', W - 8 - i * 18, heartY + 10);
        }

        // Timer
        const remaining = Math.max(0, Math.ceil(GAME_DURATION - gameTime));
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        ctx.font = KPMG.fonts.small;
        ctx.fillStyle = KPMG.colours.teal;
        ctx.textAlign = 'left';
        ctx.fillText('TIME ' + mins + ':' + (secs < 10 ? '0' : '') + secs, 8, heartY + 10);

        ctx.restore();
    }

    function onGameOver(score) {
        // No extra logic needed
    }

    /* --- Init --- */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 480 });

        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'HOW TO PLAY',
                objective: 'Risks fly in from all directions — rotate your shield to deflect them and protect the radar. Letting risks through costs health.',
                controls: [
                    'Arrow keys to rotate the shield arc',
                    'On mobile, drag left/right to rotate'
                ],
                tip: 'Anticipate where the next risk is coming from — don\'t chase the last one.'
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
