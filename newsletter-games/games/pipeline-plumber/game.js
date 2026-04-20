/**
 * Pipeline Plumber — Pipe Puzzle
 * Rotate pipe segments to connect LEAD (source) to WON (sink).
 */
(function () {
    'use strict';

    const GAME_ID = 'pipeline-plumber';
    const W = 400;
    const H = 500;
    const HUD = GameEngine.HUD_HEIGHT;

    /* --- Directions: bitmask --- */
    const DIR = { UP: 1, RIGHT: 2, DOWN: 4, LEFT: 8 };
    const DIR_DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
    const DIR_DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
    const OPPOSITE = { 1: 4, 2: 8, 4: 1, 8: 2 };

    function rotateCW(connections) {
        let result = 0;
        if (connections & DIR.UP) result |= DIR.RIGHT;
        if (connections & DIR.RIGHT) result |= DIR.DOWN;
        if (connections & DIR.DOWN) result |= DIR.LEFT;
        if (connections & DIR.LEFT) result |= DIR.UP;
        return result;
    }

    /* --- Level configs --- */
    const LEVELS = [
        { cols: 4, rows: 4, time: 30 },
        { cols: 5, rows: 5, time: 45 },
        { cols: 6, rows: 5, time: 60 }
    ];

    const STAGE_LABELS = ['Qualified', 'Proposal', 'Negotiation'];

    /* --- State --- */
    let grid, cols, rows, cellSize, gridGap, gridOffsetX, gridOffsetY;
    let sourceCol, sourceRow, sinkCol, sinkRow;
    let timer, totalRotations, parRotations, level, totalScore;
    let connected, pathComplete, completeFlash;
    let gameEnded;
    let levelTransitioning; // guard against timer race condition

    function reset() {
        level = 0;
        totalScore = 0;
        gameEnded = false;
        levelTransitioning = false;
        startLevel(level);
    }

    function startLevel(lvl) {
        const cfg = LEVELS[lvl];
        cols = cfg.cols;
        rows = cfg.rows;
        timer = cfg.time;
        totalRotations = 0;
        pathComplete = false;
        completeFlash = 0;
        levelTransitioning = false;
        gridGap = 6;
        cellSize = Math.floor(Math.min((W - 60) / cols, (H - HUD - 100) / rows) - gridGap);
        if (cellSize > 70) cellSize = 70;
        const totalW = cols * (cellSize + gridGap) - gridGap;
        const totalH = rows * (cellSize + gridGap) - gridGap;
        gridOffsetX = Math.floor((W - totalW) / 2);
        gridOffsetY = Math.floor(HUD + 40 + ((H - HUD - 80) - totalH) / 2);

        sourceRow = Math.floor(rows / 2);
        sourceCol = 0;
        sinkRow = Math.floor(rows / 2);
        sinkCol = cols - 1;

        generatePuzzle();
        connected = computeConnected();
    }

    /* --- Puzzle generation --- */
    function generatePuzzle() {
        grid = [];
        for (let r = 0; r < rows; r++) {
            grid[r] = [];
            for (let c = 0; c < cols; c++) {
                grid[r][c] = { connections: 0, solvedConnections: 0, rotation: 0 };
            }
        }

        const path = findRandomPath();

        for (let i = 0; i < path.length; i++) {
            const [r, c] = path[i];
            if (i > 0) {
                const [pr, pc] = path[i - 1];
                const dirFromPrev = getDirection(pr, pc, r, c);
                grid[r][c].solvedConnections |= OPPOSITE[dirFromPrev];
            }
            if (i < path.length - 1) {
                const [nr, nc] = path[i + 1];
                const dirToNext = getDirection(r, c, nr, nc);
                grid[r][c].solvedConnections |= dirToNext;
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c].solvedConnections === 0) {
                    const types = [
                        DIR.LEFT | DIR.RIGHT,
                        DIR.UP | DIR.DOWN,
                        DIR.UP | DIR.RIGHT,
                        DIR.RIGHT | DIR.DOWN,
                        DIR.DOWN | DIR.LEFT,
                        DIR.LEFT | DIR.UP,
                        DIR.UP | DIR.RIGHT | DIR.DOWN,
                        DIR.RIGHT | DIR.DOWN | DIR.LEFT,
                        DIR.DOWN | DIR.LEFT | DIR.UP,
                        DIR.LEFT | DIR.UP | DIR.RIGHT
                    ];
                    grid[r][c].solvedConnections = types[GameEngine.randomInt(0, types.length - 1)];
                }
                grid[r][c].connections = grid[r][c].solvedConnections;
            }
        }

        parRotations = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const rotations = GameEngine.randomInt(1, 3);
                let conn = grid[r][c].solvedConnections;
                for (let i = 0; i < rotations; i++) {
                    conn = rotateCW(conn);
                }
                grid[r][c].connections = conn;
                if (grid[r][c].connections !== grid[r][c].solvedConnections) {
                    parRotations++;
                }
            }
        }
        parRotations = Math.max(parRotations, cols);
    }

    function findRandomPath() {
        const visited = new Set();
        const parent = {};
        const queue = [[sourceRow, sourceCol]];
        visited.add(sourceRow + ',' + sourceCol);

        while (queue.length > 0) {
            const idx = Math.floor(Math.random() * queue.length);
            const [r, c] = queue.splice(idx, 1)[0];

            if (r === sinkRow && c === sinkCol) {
                const path = [];
                let cur = r + ',' + c;
                while (cur) {
                    const [cr, cc] = cur.split(',').map(Number);
                    path.unshift([cr, cc]);
                    cur = parent[cur];
                }
                return path;
            }

            const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            for (let i = neighbors.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
            }

            for (const [nr, nc] of neighbors) {
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                const key = nr + ',' + nc;
                if (visited.has(key)) continue;
                visited.add(key);
                parent[key] = r + ',' + c;
                queue.push([nr, nc]);
            }
        }

        const path = [];
        for (let c = 0; c <= sinkCol; c++) {
            path.push([sourceRow, c]);
        }
        return path;
    }

    function getDirection(fromR, fromC, toR, toC) {
        if (toR < fromR) return DIR.UP;
        if (toR > fromR) return DIR.DOWN;
        if (toC < fromC) return DIR.LEFT;
        if (toC > fromC) return DIR.RIGHT;
        return 0;
    }

    /* --- Connectivity check (BFS from source) --- */
    function computeConnected() {
        const conn = new Set();
        const queue = [[sourceRow, sourceCol]];
        conn.add(sourceRow + ',' + sourceCol);

        while (queue.length > 0) {
            const [r, c] = queue.shift();
            const cell = grid[r][c];

            const dirs = [DIR.UP, DIR.RIGHT, DIR.DOWN, DIR.LEFT];
            for (const d of dirs) {
                if (!(cell.connections & d)) continue;
                const nr = r + DIR_DY[d];
                const nc = c + DIR_DX[d];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                const key = nr + ',' + nc;
                if (conn.has(key)) continue;
                if (grid[nr][nc].connections & OPPOSITE[d]) {
                    conn.add(key);
                    queue.push([nr, nc]);
                }
            }
        }

        return conn;
    }

    function checkComplete() {
        return connected.has(sinkRow + ',' + sinkCol) && connected.has(sourceRow + ',' + sourceCol);
    }

    /* --- Input --- */
    function setupGameInput() {
        GameEngine.setupInput({
            onTap: function (x, y) {
                if (pathComplete || gameEnded || levelTransitioning) return;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const cx = gridOffsetX + c * (cellSize + gridGap);
                        const cy = gridOffsetY + r * (cellSize + gridGap);
                        if (x >= cx && x < cx + cellSize && y >= cy && y < cy + cellSize) {
                            grid[r][c].connections = rotateCW(grid[r][c].connections);
                            totalRotations++;

                            connected = computeConnected();

                            if (checkComplete()) {
                                pathComplete = true;
                                completeFlash = 1;
                                handleLevelComplete();
                            }
                            return;
                        }
                    }
                }
            }
        });
    }

    function handleLevelComplete() {
        levelTransitioning = true;
        const timeBonus = Math.ceil(timer) * 50;
        const rotUnderPar = Math.max(0, parRotations * 2 - totalRotations);
        const efficiencyBonus = rotUnderPar * 10;
        const levelScore = 1000 + timeBonus + efficiencyBonus;
        totalScore += levelScore;
        GameEngine.state.score = totalScore;

        setTimeout(() => {
            if (gameEnded) return; // guard against race condition
            if (level < LEVELS.length - 1) {
                level++;
                startLevel(level);
            } else {
                GameEngine.endGame();
            }
        }, 1500);
    }

    /* --- Update --- */
    function onUpdate(dt) {
        if (gameEnded) return;

        if (!pathComplete && !levelTransitioning) {
            timer -= dt;
            if (timer <= 0) {
                timer = 0;
                gameEnded = true;
                GameEngine.state.score = totalScore;
                GameEngine.endGame();
                return;
            }
        }

        if (pathComplete && completeFlash > 0) {
            completeFlash -= dt * 2;
            if (completeFlash < 0) completeFlash = 0;
        }
    }

    /* --- Draw --- */
    function onDraw(ctx) {
        ctx.fillStyle = KPMG.colours.white;
        ctx.fillRect(0, 0, W, H);

        const barY = HUD;
        ctx.fillStyle = '#F0F0F0';
        ctx.fillRect(0, barY, W, 32);

        ctx.font = KPMG.fonts.hud;
        ctx.fillStyle = KPMG.colours.blue;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Level ' + (level + 1) + '/' + LEVELS.length, 12, barY + 16);

        const secs = Math.ceil(timer);
        ctx.textAlign = 'right';
        ctx.fillStyle = timer < 10 ? KPMG.colours.red : KPMG.colours.blue;
        ctx.fillText(secs + 's', W - 12, barY + 16);

        ctx.textAlign = 'center';
        ctx.font = KPMG.fonts.small;
        ctx.fillStyle = KPMG.colours.mid;
        ctx.fillText('Rotations: ' + totalRotations, W / 2, barY + 16);

        const srcX = gridOffsetX - 6;
        const srcY = gridOffsetY + sourceRow * (cellSize + gridGap) + cellSize / 2;
        ctx.save();
        ctx.fillStyle = KPMG.colours.green;
        GameEngine.drawRoundedRect(ctx, srcX - 40, srcY - 12, 38, 24, 4);
        ctx.fill();
        ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LEAD', srcX - 21, srcY);
        ctx.restore();

        const snkX = gridOffsetX + sinkCol * (cellSize + gridGap) + cellSize + 6;
        const snkY = gridOffsetY + sinkRow * (cellSize + gridGap) + cellSize / 2;
        ctx.save();
        ctx.fillStyle = KPMG.colours.amber;
        GameEngine.drawRoundedRect(ctx, snkX + 2, snkY - 12, 38, 24, 4);
        ctx.fill();
        ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WON', snkX + 21, snkY);
        ctx.restore();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cx = gridOffsetX + c * (cellSize + gridGap);
                const cy = gridOffsetY + r * (cellSize + gridGap);
                const cell = grid[r][c];
                const key = r + ',' + c;
                const isConnected = connected.has(key);

                ctx.fillStyle = '#F0F2F5';
                GameEngine.drawRoundedRect(ctx, cx, cy, cellSize, cellSize, 4);
                ctx.fill();

                let pipeColor;
                if (pathComplete) {
                    pipeColor = isConnected ? KPMG.colours.green : KPMG.colours.blue;
                } else if (isConnected) {
                    pipeColor = KPMG.colours.pacific;
                } else {
                    pipeColor = KPMG.colours.blue;
                }

                const midX = cx + cellSize / 2;
                const midY = cy + cellSize / 2;
                const pipeW = 8;

                ctx.strokeStyle = pipeColor;
                ctx.lineWidth = pipeW;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                const conn = cell.connections;

                ctx.beginPath();
                if (conn & DIR.UP) {
                    ctx.moveTo(midX, midY);
                    ctx.lineTo(midX, cy);
                }
                if (conn & DIR.DOWN) {
                    ctx.moveTo(midX, midY);
                    ctx.lineTo(midX, cy + cellSize);
                }
                if (conn & DIR.LEFT) {
                    ctx.moveTo(midX, midY);
                    ctx.lineTo(cx, midY);
                }
                if (conn & DIR.RIGHT) {
                    ctx.moveTo(midX, midY);
                    ctx.lineTo(cx + cellSize, midY);
                }
                ctx.stroke();

                ctx.fillStyle = pipeColor;
                ctx.beginPath();
                ctx.arc(midX, midY, pipeW / 2 + 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (connected.size > 2) {
            const connectedCells = [];
            for (const key of connected) {
                const [r, c] = key.split(',').map(Number);
                connectedCells.push([r, c]);
            }
            connectedCells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

            const labelCount = Math.min(STAGE_LABELS.length, connectedCells.length - 2);
            for (let i = 0; i < labelCount; i++) {
                const idx = Math.floor((i + 1) * connectedCells.length / (labelCount + 1));
                if (idx >= 0 && idx < connectedCells.length) {
                    const [lr, lc] = connectedCells[idx];
                    const lx = gridOffsetX + lc * (cellSize + gridGap) + cellSize / 2;
                    const ly = gridOffsetY + lr * (cellSize + gridGap) - 6;
                    ctx.save();
                    ctx.font = 'bold 8px Arial, Helvetica, sans-serif';
                    ctx.fillStyle = KPMG.colours.cobalt;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(STAGE_LABELS[i], lx, ly);
                    ctx.restore();
                }
            }
        }

        if (pathComplete && completeFlash > 0) {
            ctx.save();
            ctx.globalAlpha = completeFlash * 0.3;
            ctx.fillStyle = KPMG.colours.green;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        if (pathComplete) {
            ctx.save();
            ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.green;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 4;
            const msg = level < LEVELS.length - 1 ? 'CONNECTED! Next level...' : 'ALL LEVELS COMPLETE!';
            ctx.fillText(msg, W / 2, H - 30);
            ctx.restore();
        }
    }

    function onGameOver(score) {
        gameEnded = true;
    }

    /* --- Init --- */
    function init() {
        GameEngine.initCanvas('game-container', { width: W, height: H, maxWidth: 480 });

        GameEngine.startGame(GAME_ID, {
            instructions: {
                title: 'HOW TO PLAY',
                objective: 'Rotate the pipe segments to build a continuous path from LEAD (source) to WON (sink). Complete the pipeline to score.',
                controls: [
                    'Click or tap a pipe to rotate it 90 degrees',
                    'Connect all segments from start to finish'
                ],
                tip: 'Work backwards from the sink — it can be easier to trace the path in reverse.'
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
