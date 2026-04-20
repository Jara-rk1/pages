/**
 * Slide Deck Stacker — Tower Stacking Game
 * Stack consulting slide blocks as high as possible.
 * Overhanging portions get trimmed; perfect placements are rewarded.
 */

(function () {
    'use strict';

    const GAME_ID = 'slide-deck-stacker';
    const W = 400;
    const H = 700;
    const BLOCK_HEIGHT = 30;
    const STARTING_WIDTH = 300;
    const MIN_WIDTH = 5;
    const PERFECT_THRESHOLD = 3;
    const BASE_SPEED = 180;       // px/sec horizontal swing
    const SPEED_INCREMENT = 8;    // added per successful stack
    const DROP_SPEED = 800;       // px/sec falling
    const FALL_PIECE_SPEED = 400; // px/sec for trimmed pieces

    const SLIDE_TITLES = [
        'Executive Summary', 'Key Findings', 'Recommendations', 'Appendix A',
        'Risk Matrix', 'Stakeholder Map', 'Timeline', 'Budget Overview',
        'Next Steps', 'Methodology', 'Case Studies', 'Governance'
    ];

    const palette = KPMG.colours.palette;

    // ---- Game State ----
    let stack = [];
    let currentBlock = null;
    let fallingPieces = [];
    let perfectPopups = [];
    let cameraY = 0;
    let dropping = false;
    let gameActive = false;
    let blockCount = 0;

    function reset() {
        stack = [];
        fallingPieces = [];
        perfectPopups = [];
        cameraY = 0;
        dropping = false;
        gameActive = false;
        blockCount = 0;

        // Base platform
        const baseX = (W - STARTING_WIDTH) / 2;
        const baseY = H - 80;
        stack.push({
            x: baseX,
            y: baseY,
            w: STARTING_WIDTH,
            colour: KPMG.colours.dark,
            title: 'Foundation'
        });

        spawnBlock();
        gameActive = true;
    }

    function spawnBlock() {
        const top = stack[stack.length - 1];
        const colourIdx = blockCount % palette.length;
        const titleIdx = blockCount % SLIDE_TITLES.length;
        const speed = BASE_SPEED + blockCount * SPEED_INCREMENT;

        currentBlock = {
            x: 0,
            y: top.y - BLOCK_HEIGHT,
            w: top.w,
            colour: palette[colourIdx],
            title: SLIDE_TITLES[titleIdx],
            direction: 1,
            speed: speed
        };
        dropping = false;
    }

    function dropBlock() {
        if (dropping || !currentBlock || !gameActive) return;
        dropping = true;
    }

    function setupGameInput() {
        GameEngine.setupInput({
            onTap: function () { dropBlock(); },
            onKey: function (key) {
                if (key === ' ' || key === 'Enter') dropBlock();
            }
        });
    }

    // ---- Update ----
    function update(dt) {
        if (!gameActive) return;

        if (currentBlock) {
            if (!dropping) {
                currentBlock.x += currentBlock.direction * currentBlock.speed * dt;
                if (currentBlock.x + currentBlock.w > W) {
                    currentBlock.x = W - currentBlock.w;
                    currentBlock.direction = -1;
                }
                if (currentBlock.x < 0) {
                    currentBlock.x = 0;
                    currentBlock.direction = 1;
                }
            } else {
                const targetY = stack[stack.length - 1].y - BLOCK_HEIGHT;
                currentBlock.y += DROP_SPEED * dt;

                if (currentBlock.y >= targetY) {
                    currentBlock.y = targetY;
                    landBlock();
                }
            }
        }

        for (let i = fallingPieces.length - 1; i >= 0; i--) {
            const p = fallingPieces[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 600 * dt;
            if (p.y > H + cameraY + 100) {
                fallingPieces.splice(i, 1);
            }
        }

        for (let i = perfectPopups.length - 1; i >= 0; i--) {
            perfectPopups[i].age += dt;
            if (perfectPopups[i].age > 1.2) {
                perfectPopups.splice(i, 1);
            }
        }

        if (stack.length > 1) {
            const topBlockY = stack[stack.length - 1].y;
            const desiredCamera = Math.max(0, -(topBlockY - H * 0.45));
            cameraY += (desiredCamera - cameraY) * 0.08;
        }
    }

    function landBlock() {
        const top = stack[stack.length - 1];
        const block = currentBlock;

        const overlapLeft = Math.max(block.x, top.x);
        const overlapRight = Math.min(block.x + block.w, top.x + top.w);
        const overlapWidth = overlapRight - overlapLeft;

        if (overlapWidth <= 0) {
            fallingPieces.push({
                x: block.x, y: block.y, w: block.w, h: BLOCK_HEIGHT,
                colour: block.colour, vx: block.direction * 80, vy: -50
            });
            gameActive = false;
            GameEngine.endGame();
            return;
        }

        const overhang = Math.abs((block.x + block.w / 2) - (top.x + top.w / 2));
        const isPerfect = overhang < PERFECT_THRESHOLD && Math.abs(block.w - top.w) < PERFECT_THRESHOLD;

        if (isPerfect) {
            stack.push({
                x: top.x,
                y: block.y,
                w: top.w,
                colour: block.colour,
                title: block.title
            });
            perfectPopups.push({
                x: top.x + top.w / 2,
                y: block.y - 10,
                text: '+PERFECT!',
                age: 0
            });
        } else {
            stack.push({
                x: overlapLeft,
                y: block.y,
                w: overlapWidth,
                colour: block.colour,
                title: block.title
            });

            if (block.x < top.x) {
                const trimW = top.x - block.x;
                fallingPieces.push({
                    x: block.x, y: block.y, w: trimW, h: BLOCK_HEIGHT,
                    colour: block.colour, vx: -120, vy: -30
                });
            }
            if (block.x + block.w > top.x + top.w) {
                const trimX = top.x + top.w;
                const trimW = (block.x + block.w) - trimX;
                fallingPieces.push({
                    x: trimX, y: block.y, w: trimW, h: BLOCK_HEIGHT,
                    colour: block.colour, vx: 120, vy: -30
                });
            }
        }

        blockCount++;
        GameEngine.state.score = blockCount;

        const newTop = stack[stack.length - 1];
        if (newTop.w < MIN_WIDTH) {
            gameActive = false;
            GameEngine.endGame();
            return;
        }

        spawnBlock();
    }

    // ---- Draw ----
    function draw(ctx) {
        const w = W;
        const h = H;

        ctx.fillStyle = '#F0F0F0';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.strokeStyle = KPMG.colours.border;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (let gx = 50; gx < w; gx += 50) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        ctx.translate(0, cameraY);

        for (let i = 0; i < stack.length; i++) {
            const b = stack[i];
            drawBlock(ctx, b.x, b.y, b.w, BLOCK_HEIGHT, b.colour, b.title);
        }

        if (currentBlock) {
            drawBlock(ctx, currentBlock.x, currentBlock.y, currentBlock.w, BLOCK_HEIGHT, currentBlock.colour, currentBlock.title);

            if (!dropping) {
                ctx.strokeStyle = 'rgba(0,51,141,0.15)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(currentBlock.x, currentBlock.y + BLOCK_HEIGHT);
                ctx.lineTo(currentBlock.x, H + 100);
                ctx.moveTo(currentBlock.x + currentBlock.w, currentBlock.y + BLOCK_HEIGHT);
                ctx.lineTo(currentBlock.x + currentBlock.w, H + 100);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        for (const p of fallingPieces) {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = p.colour;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.globalAlpha = 1;
        }

        for (const popup of perfectPopups) {
            const alpha = Math.max(0, 1 - popup.age / 1.2);
            const offsetY = -popup.age * 40;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.green;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(popup.text, popup.x, popup.y + offsetY);
            ctx.restore();
        }

        ctx.restore();

        ctx.save();
        ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('Slides: ' + blockCount, W - 70, GameEngine.HUD_HEIGHT / 2);
        ctx.restore();

        if (blockCount === 0 && !dropping && gameActive) {
            ctx.save();
            ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.blue;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 300);
            ctx.fillText('TAP TO DROP', W / 2, H / 2 - 60);
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawBlock(ctx, x, y, w, h, colour, title) {
        ctx.fillStyle = colour;
        ctx.fillRect(x, y, w, h);

        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x, y, w, 3);

        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(x, y + h - 2, w, 2);

        if (w > 40 && title) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 4, y, w - 8, h);
            ctx.clip();
            ctx.font = '10px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(title, x + w / 2, y + h / 2);
            ctx.restore();
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    }

    // ---- Init ----
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H });

        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'HOW TO PLAY',
                objective: 'Stack consulting slides as high as possible. Each block swings side to side — drop it precisely. Overhanging parts are trimmed!',
                controls: [
                    'Tap screen or press Space to drop the sliding block',
                    'Perfect alignment gives a bonus'
                ],
                tip: 'Wait for the block to line up exactly — perfect stacks keep the tower full-width.'
            },
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
