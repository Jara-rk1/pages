/**
 * Strategy Snake — KPMG Newsletter Minigame
 * Classic snake collecting strategic initiatives, avoiding scope creep walls.
 */
(function () {
    'use strict';

    const GAME_ID = 'strategy-snake';
    const GRID_SIZE = 20;
    const CELL_SIZE = 20;
    const CANVAS_SIZE = GRID_SIZE * CELL_SIZE; // 400
    const PADDING = 50;
    const CANVAS_W = CANVAS_SIZE;
    const CANVAS_H = CANVAS_SIZE + PADDING + 20;
    const BASE_SPEED = 8;
    const MAX_SPEED = 20;

    const INITIATIVES = ['AI', 'ESG', 'M&A', 'CX', 'Risk', 'Cloud', 'Data', 'Cyber'];

    /* ---- state ---- */
    let snake, direction, nextDirection, food, scopeCreepWalls;
    let moveTimer, itemsEaten, speed, score, dead, foodIndex;

    function reset() {
        snake = [
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 }
        ];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        food = null;
        scopeCreepWalls = [];
        moveTimer = 0;
        itemsEaten = 0;
        speed = BASE_SPEED;
        score = 0;
        dead = false;
        foodIndex = 0;
        GameEngine.state.score = 0;
        spawnFood();
    }

    /* ---- check if cell is occupied ---- */
    function isOccupied(gx, gy) {
        for (var i = 0; i < snake.length; i++) {
            if (snake[i].x === gx && snake[i].y === gy) return true;
        }
        for (var j = 0; j < scopeCreepWalls.length; j++) {
            if (scopeCreepWalls[j].x === gx && scopeCreepWalls[j].y === gy) return true;
        }
        if (food && food.x === gx && food.y === gy) return true;
        return false;
    }

    /* ---- find free cell ---- */
    function findFreeCell() {
        var attempts = 0;
        while (attempts < 500) {
            var gx = Math.floor(Math.random() * GRID_SIZE);
            var gy = Math.floor(Math.random() * GRID_SIZE);
            if (!isOccupied(gx, gy)) return { x: gx, y: gy };
            attempts++;
        }
        for (var x = 0; x < GRID_SIZE; x++) {
            for (var y = 0; y < GRID_SIZE; y++) {
                if (!isOccupied(x, y)) return { x: x, y: y };
            }
        }
        return null;
    }

    /* ---- spawn food ---- */
    function spawnFood() {
        var pos = findFreeCell();
        if (!pos) {
            die();
            return;
        }
        var label = INITIATIVES[foodIndex % INITIATIVES.length];
        var colour = KPMG.colours.palette[foodIndex % KPMG.colours.palette.length];
        food = { x: pos.x, y: pos.y, label: label, colour: colour };
        foodIndex++;
    }

    /* ---- add scope creep walls ---- */
    function addScopeCreep() {
        var count = 3 + Math.floor(Math.random() * 3);
        for (var i = 0; i < count; i++) {
            var pos = findFreeCell();
            if (pos) {
                scopeCreepWalls.push({ x: pos.x, y: pos.y });
            }
        }
    }

    /* ---- move snake ---- */
    function moveSnake() {
        direction = { x: nextDirection.x, y: nextDirection.y };

        var head = snake[0];
        var newHead = { x: head.x + direction.x, y: head.y + direction.y };

        if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
            die();
            return;
        }

        for (var i = 0; i < snake.length; i++) {
            if (snake[i].x === newHead.x && snake[i].y === newHead.y) {
                die();
                return;
            }
        }

        for (var j = 0; j < scopeCreepWalls.length; j++) {
            if (scopeCreepWalls[j].x === newHead.x && scopeCreepWalls[j].y === newHead.y) {
                die();
                return;
            }
        }

        snake.unshift(newHead);

        if (food && newHead.x === food.x && newHead.y === food.y) {
            itemsEaten++;
            score += 100;
            GameEngine.state.score = score;

            speed = Math.min(MAX_SPEED, BASE_SPEED + Math.floor(itemsEaten / 5) * 2);

            if (itemsEaten % 5 === 0) {
                addScopeCreep();
            }

            spawnFood();
        } else {
            snake.pop();
        }
    }

    function die() {
        if (dead) return;
        dead = true;
        GameEngine.endGame();
    }

    /* ---- update ---- */
    function update(dt) {
        if (dead) return;

        moveTimer += dt;
        var moveInterval = 1 / speed;

        while (moveTimer >= moveInterval) {
            moveTimer -= moveInterval;
            moveSnake();
            if (dead) return;
        }
    }

    /* ---- draw ---- */
    function draw(ctx) {
        var w = CANVAS_W;
        var totalH = CANVAS_H;

        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, w, totalH);

        ctx.fillStyle = KPMG.colours.blue;
        ctx.fillRect(0, 0, w, PADDING - 4);
        ctx.font = KPMG.fonts.hud;
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Score: ' + score, 12, PADDING / 2 - 2);

        ctx.textAlign = 'center';
        ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillText('Speed: ' + speed + '/s', w / 2, PADDING / 2 - 2);

        ctx.textAlign = 'right';
        ctx.font = KPMG.fonts.hud;
        ctx.fillText('Items: ' + itemsEaten, w - 12, PADDING / 2 - 2);

        var ox = 0;
        var oy = PADDING;

        ctx.fillStyle = KPMG.colours.white;
        ctx.fillRect(ox, oy, CANVAS_SIZE, CANVAS_SIZE);

        ctx.strokeStyle = KPMG.colours.border;
        ctx.lineWidth = 0.5;
        for (var gx = 0; gx <= GRID_SIZE; gx++) {
            ctx.beginPath();
            ctx.moveTo(ox + gx * CELL_SIZE, oy);
            ctx.lineTo(ox + gx * CELL_SIZE, oy + CANVAS_SIZE);
            ctx.stroke();
        }
        for (var gy = 0; gy <= GRID_SIZE; gy++) {
            ctx.beginPath();
            ctx.moveTo(ox, oy + gy * CELL_SIZE);
            ctx.lineTo(ox + CANVAS_SIZE, oy + gy * CELL_SIZE);
            ctx.stroke();
        }

        for (var si = 0; si < scopeCreepWalls.length; si++) {
            var sw = scopeCreepWalls[si];
            ctx.fillStyle = KPMG.colours.red;
            ctx.fillRect(ox + sw.x * CELL_SIZE + 1, oy + sw.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);

            ctx.strokeStyle = KPMG.colours.white;
            ctx.lineWidth = 1.5;
            var scx = ox + sw.x * CELL_SIZE;
            var scy = oy + sw.y * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(scx + 5, scy + 5);
            ctx.lineTo(scx + CELL_SIZE - 5, scy + CELL_SIZE - 5);
            ctx.moveTo(scx + CELL_SIZE - 5, scy + 5);
            ctx.lineTo(scx + 5, scy + CELL_SIZE - 5);
            ctx.stroke();
        }

        if (food) {
            var fx = ox + food.x * CELL_SIZE + CELL_SIZE / 2;
            var fy = oy + food.y * CELL_SIZE + CELL_SIZE / 2;
            var fr = CELL_SIZE / 2 - 2;

            ctx.beginPath();
            ctx.arc(fx, fy, fr, 0, Math.PI * 2);
            ctx.fillStyle = food.colour;
            ctx.fill();

            ctx.font = 'bold 7px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(food.label, fx, fy);
        }

        for (var i = snake.length - 1; i >= 0; i--) {
            var seg = snake[i];
            var sx = ox + seg.x * CELL_SIZE;
            var sy = oy + seg.y * CELL_SIZE;
            var pad = 1;

            if (i === 0) {
                ctx.fillStyle = KPMG.colours.blue;
                GameEngine.drawRoundedRect(ctx, sx + pad, sy + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, 4);
                ctx.fill();

                var eyeSize = 2.5;
                ctx.fillStyle = KPMG.colours.white;
                var ecx = sx + CELL_SIZE / 2;
                var ecy = sy + CELL_SIZE / 2;
                var edx = direction.x * 3;
                var edy = direction.y * 3;
                ctx.beginPath();
                ctx.arc(ecx + edx - 3, ecy + edy - 3, eyeSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(ecx + edx + 3, ecy + edy - 3, eyeSize, 0, Math.PI * 2);
                ctx.fill();
            } else {
                var t = snake.length > 1 ? i / (snake.length - 1) : 0;
                var r1 = 0x00, g1 = 0xB8, b1 = 0xF5;
                var r2 = 0x76, g2 = 0xD2, b2 = 0xFF;
                var rr = Math.round(r1 + (r2 - r1) * t);
                var rg = Math.round(g1 + (g2 - g1) * t);
                var rb = Math.round(b1 + (b2 - b1) * t);
                ctx.fillStyle = 'rgb(' + rr + ',' + rg + ',' + rb + ')';
                GameEngine.drawRoundedRect(ctx, sx + pad, sy + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, 3);
                ctx.fill();
            }
        }

        if (scopeCreepWalls.length > 0) {
            ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.red;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText('Scope Creep: ' + scopeCreepWalls.length + ' blocks', w - 8, oy + CANVAS_SIZE + 4);
        }
    }

    /* ---- direction helpers ---- */
    function setDirection(dx, dy) {
        if (direction.x === -dx && direction.y === -dy) return;
        if (direction.x === dx && direction.y === dy) return;
        nextDirection = { x: dx, y: dy };
    }

    /* ---- game over callback ---- */
    function onGameOver() {
        // Nothing extra needed
    }

    function setupGameInput() {
        GameEngine.setupInput({
            onSwipeUp: function () { setDirection(0, -1); },
            onSwipeDown: function () { setDirection(0, 1); },
            onSwipeLeft: function () { setDirection(-1, 0); },
            onSwipeRight: function () { setDirection(1, 0); },
            onKey: function (key) {
                switch (key) {
                    case 'ArrowUp': case 'w': case 'W':
                        setDirection(0, -1); break;
                    case 'ArrowDown': case 's': case 'S':
                        setDirection(0, 1); break;
                    case 'ArrowLeft': case 'a': case 'A':
                        setDirection(-1, 0); break;
                    case 'ArrowRight': case 'd': case 'D':
                        setDirection(1, 0); break;
                }
            }
        });
    }

    /* ---- init ---- */
    function init() {
        GameEngine.initCanvas('game-container', {
            width: CANVAS_W,
            height: CANVAS_H,
            maxWidth: 480
        });

        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'HOW TO PLAY',
                objective: 'Grow your strategy snake by collecting initiatives. Avoid hitting the walls and your own tail — scope creep is fatal!',
                controls: [
                    'Arrow keys to change direction',
                    'On mobile, swipe to steer'
                ],
                tip: 'Plan your route ahead — long snakes need wide turns.'
            },
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
