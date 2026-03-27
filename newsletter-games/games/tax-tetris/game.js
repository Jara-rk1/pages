/**
 * Tax Tetris — Classic Tetris with KPMG Tax Types
 * Each tetromino shape represents a different tax type.
 * Clear rows to "lodge" them.
 */

(function () {
    'use strict';

    const GAME_ID = 'tax-tetris';
    const W = 400;
    const H = 700;

    // Playfield
    const COLS = 10;
    const ROWS = 20;
    const CELL = 28;
    const FIELD_W = COLS * CELL;   // 280
    const FIELD_H = ROWS * CELL;   // 560
    const FIELD_X = (W - FIELD_W) / 2; // 60
    const FIELD_Y = H - FIELD_H - 20;  // 120

    // Side panel
    const PANEL_X = FIELD_X + FIELD_W + 12;
    const PANEL_Y = FIELD_Y;

    // Tetromino definitions: shape rotations, colour, tax label
    const PIECES = {
        I: {
            shapes: [
                [[1,1,1,1]],
                [[1],[1],[1],[1]]
            ],
            colour: KPMG.colours.blue,
            tax: 'GST'
        },
        O: {
            shapes: [
                [[1,1],[1,1]]
            ],
            colour: KPMG.colours.pacific,
            tax: 'FBT'
        },
        T: {
            shapes: [
                [[0,1,0],[1,1,1]],
                [[1,0],[1,1],[1,0]],
                [[1,1,1],[0,1,0]],
                [[0,1],[1,1],[0,1]]
            ],
            colour: KPMG.colours.cobalt,
            tax: 'CGT'
        },
        S: {
            shapes: [
                [[0,1,1],[1,1,0]],
                [[1,0],[1,1],[0,1]]
            ],
            colour: KPMG.colours.lightBlue,
            tax: 'R&D'
        },
        Z: {
            shapes: [
                [[1,1,0],[0,1,1]],
                [[0,1],[1,1],[1,0]]
            ],
            colour: KPMG.colours.purple,
            tax: 'PAY'
        },
        J: {
            shapes: [
                [[1,0,0],[1,1,1]],
                [[1,1],[1,0],[1,0]],
                [[1,1,1],[0,0,1]],
                [[0,1],[0,1],[1,1]]
            ],
            colour: KPMG.colours.lightPurple,
            tax: 'SUP'
        },
        L: {
            shapes: [
                [[0,0,1],[1,1,1]],
                [[1,0],[1,0],[1,1]],
                [[1,1,1],[1,0,0]],
                [[1,1],[0,1],[0,1]]
            ],
            colour: KPMG.colours.teal,
            tax: 'STP'
        }
    };

    const PIECE_NAMES = Object.keys(PIECES);

    // Scoring
    const LINE_SCORES = [0, 100, 300, 500, 800];
    const LINE_LABELS = ['', 'LODGED!', 'DOUBLE!', 'TRIPLE!', 'TAX-RIS!'];

    // ---- State ----
    let grid = [];
    let current = null;
    let nextType = null;
    let score = 0;
    let level = 1;
    let linesCleared = 0;
    let dropTimer = 0;
    let dropInterval = 1.0;
    let softDropping = false;
    let gameActive = false;
    let flashRows = [];
    let flashTimer = 0;
    let clearLabel = '';
    let clearLabelTimer = 0;
    let lockDelay = 0;
    const LOCK_DELAY_MAX = 0.5;
    let bag = [];

    // Keyup listener reference for cleanup
    let keyUpHandler = null;

    function reset() {
        createGrid();
        bag = [];
        nextType = null;
        current = null;
        score = 0;
        level = 1;
        linesCleared = 0;
        dropTimer = 0;
        dropInterval = 1.0;
        softDropping = false;
        flashRows = [];
        flashTimer = 0;
        clearLabel = '';
        clearLabelTimer = 0;
        lockDelay = 0;
        gameActive = true;
        spawnPiece();
    }

    // ---- Grid ----
    function createGrid() {
        grid = [];
        for (let r = 0; r < ROWS; r++) {
            grid.push(new Array(COLS).fill(null));
        }
    }

    // ---- Bag ----
    function nextFromBag() {
        if (bag.length === 0) {
            bag = PIECE_NAMES.slice();
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
        }
        return bag.pop();
    }

    // ---- Piece helpers ----
    function getShape(type, rotation) {
        const shapes = PIECES[type].shapes;
        return shapes[rotation % shapes.length];
    }

    function spawnPiece() {
        const type = nextType || nextFromBag();
        nextType = nextFromBag();
        const shape = getShape(type, 0);
        const col = Math.floor((COLS - shape[0].length) / 2);
        current = { type, rotation: 0, row: 0, col };

        if (!canPlace(current.type, current.rotation, current.row, current.col)) {
            gameActive = false;
            GameEngine.state.score = score;
            GameEngine.endGame();
        }

        lockDelay = 0;
    }

    function canPlace(type, rotation, row, col) {
        const shape = getShape(type, rotation);
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const gr = row + r;
                const gc = col + c;
                if (gc < 0 || gc >= COLS || gr >= ROWS) return false;
                if (gr >= 0 && grid[gr][gc] !== null) return false;
            }
        }
        return true;
    }

    function placePiece() {
        const shape = getShape(current.type, current.rotation);
        const piece = PIECES[current.type];
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const gr = current.row + r;
                const gc = current.col + c;
                if (gr >= 0 && gr < ROWS) {
                    grid[gr][gc] = { colour: piece.colour, tax: piece.tax };
                }
            }
        }
    }

    function ghostRow() {
        let row = current.row;
        while (canPlace(current.type, current.rotation, row + 1, current.col)) {
            row++;
        }
        return row;
    }

    function tryMove(dCol, dRow) {
        if (canPlace(current.type, current.rotation, current.row + dRow, current.col + dCol)) {
            current.row += dRow;
            current.col += dCol;
            if (dRow === 0) lockDelay = 0;
            return true;
        }
        return false;
    }

    function tryRotate() {
        const shapes = PIECES[current.type].shapes;
        const newRot = (current.rotation + 1) % shapes.length;
        if (canPlace(current.type, newRot, current.row, current.col)) {
            current.rotation = newRot;
            lockDelay = 0;
            return;
        }
        const kicks = [-1, 1, -2, 2];
        for (const offset of kicks) {
            if (canPlace(current.type, newRot, current.row, current.col + offset)) {
                current.col += offset;
                current.rotation = newRot;
                lockDelay = 0;
                return;
            }
        }
    }

    function hardDrop() {
        while (canPlace(current.type, current.rotation, current.row + 1, current.col)) {
            current.row++;
        }
        lockPiece();
    }

    function lockPiece() {
        placePiece();
        checkLines();
        spawnPiece();
        dropTimer = 0;
        lockDelay = 0;
        softDropping = false;
    }

    function checkLines() {
        const full = [];
        for (let r = 0; r < ROWS; r++) {
            if (grid[r].every(cell => cell !== null)) {
                full.push(r);
            }
        }
        if (full.length === 0) return;

        flashRows = full;
        flashTimer = 0.6;

        const lines = full.length;
        const gained = LINE_SCORES[Math.min(lines, 4)];
        score += gained;
        linesCleared += lines;
        clearLabel = LINE_LABELS[Math.min(lines, 4)];
        clearLabelTimer = 1.2;

        GameEngine.state.score = score;

        level = Math.floor(linesCleared / 10) + 1;
        dropInterval = Math.max(0.05, 1.0 - (level - 1) * 0.08);
    }

    function clearFullRows() {
        for (let i = flashRows.length - 1; i >= 0; i--) {
            grid.splice(flashRows[i], 1);
            grid.unshift(new Array(COLS).fill(null));
        }
        flashRows = [];
    }

    // ---- Input ----
    function setupGameInput() {
        // Remove old keyup handler if present
        if (keyUpHandler) {
            document.removeEventListener('keyup', keyUpHandler);
        }

        keyUpHandler = function (e) {
            if (e.key === 'ArrowDown') softDropping = false;
        };
        document.addEventListener('keyup', keyUpHandler);

        // Only use onKey for all keyboard/touch input -- no swipe/tap mappings
        GameEngine.setupInput({
            onTap: null,
            onSwipeLeft: null,
            onSwipeRight: null,
            onSwipeDown: null,
            onSwipeUp: null,
            onKey: function (key) {
                if (!current || !gameActive) return;
                switch (key) {
                    case 'ArrowLeft': tryMove(-1, 0); break;
                    case 'ArrowRight': tryMove(1, 0); break;
                    case 'ArrowUp': tryRotate(); break;
                    case 'ArrowDown': softDropping = true; break;
                    case ' ': hardDrop(); break;
                }
            }
        });
    }

    // ---- Update ----
    function update(dt) {
        if (!gameActive) return;

        if (flashTimer > 0) {
            flashTimer -= dt;
            if (flashTimer <= 0) {
                clearFullRows();
            }
            return;
        }

        if (clearLabelTimer > 0) {
            clearLabelTimer -= dt;
        }

        if (!current) return;

        const interval = softDropping ? dropInterval * 0.1 : dropInterval;
        dropTimer += dt;

        if (dropTimer >= interval) {
            dropTimer -= interval;
            if (!tryMove(0, 1)) {
                lockDelay += interval;
                if (lockDelay >= LOCK_DELAY_MAX) {
                    lockPiece();
                }
            } else {
                lockDelay = 0;
            }
        }
    }

    // ---- Draw ----
    function draw(ctx) {
        ctx.fillStyle = '#F0F0F0';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = KPMG.colours.white;
        ctx.fillRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);

        ctx.strokeStyle = KPMG.colours.border;
        ctx.lineWidth = 0.5;
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(FIELD_X, FIELD_Y + r * CELL);
            ctx.lineTo(FIELD_X + FIELD_W, FIELD_Y + r * CELL);
            ctx.stroke();
        }
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(FIELD_X + c * CELL, FIELD_Y);
            ctx.lineTo(FIELD_X + c * CELL, FIELD_Y + FIELD_H);
            ctx.stroke();
        }

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c]) {
                    const isFlashing = flashRows.includes(r);
                    if (isFlashing && Math.floor(flashTimer * 8) % 2 === 0) {
                        drawCell(ctx, c, r, KPMG.colours.white, '');
                    } else {
                        drawCell(ctx, c, r, grid[r][c].colour, grid[r][c].tax);
                    }
                }
            }
        }

        if (current && gameActive && flashTimer <= 0) {
            const gr = ghostRow();
            const shape = getShape(current.type, current.rotation);
            const piece = PIECES[current.type];
            ctx.globalAlpha = 0.2;
            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (shape[r][c]) {
                        drawCell(ctx, current.col + c, gr + r, piece.colour, '');
                    }
                }
            }
            ctx.globalAlpha = 1;
        }

        if (current && gameActive && flashTimer <= 0) {
            const shape = getShape(current.type, current.rotation);
            const piece = PIECES[current.type];
            for (let r = 0; r < shape.length; r++) {
                for (let c = 0; c < shape[r].length; c++) {
                    if (shape[r][c]) {
                        drawCell(ctx, current.col + c, current.row + r, piece.colour, piece.tax);
                    }
                }
            }
        }

        ctx.strokeStyle = KPMG.colours.dark;
        ctx.lineWidth = 2;
        ctx.strokeRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);

        const lpX = 4;
        const lpY = FIELD_Y + 4;

        ctx.save();
        ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.dark;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.fillText('LEVEL', lpX, lpY);
        ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.blue;
        ctx.fillText('' + level, lpX, lpY + 14);

        ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.dark;
        ctx.fillText('LINES', lpX, lpY + 48);
        ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.blue;
        ctx.fillText('' + linesCleared, lpX, lpY + 62);

        ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.dark;
        ctx.fillText('SCORE', lpX, lpY + 96);
        ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.blue;
        ctx.fillText('' + score, lpX, lpY + 110);
        ctx.restore();

        const rpX = FIELD_X + FIELD_W + 8;
        const rpY = FIELD_Y + 4;
        ctx.save();
        ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.dark;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('NEXT', rpX, rpY);

        if (nextType) {
            const nShape = getShape(nextType, 0);
            const nPiece = PIECES[nextType];
            const previewCell = 16;
            const previewX = rpX + 4;
            const previewY = rpY + 20;

            ctx.fillStyle = '#F5F5F5';
            ctx.fillRect(previewX - 2, previewY - 2, previewCell * 4 + 4, previewCell * 4 + 4);
            ctx.strokeStyle = KPMG.colours.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(previewX - 2, previewY - 2, previewCell * 4 + 4, previewCell * 4 + 4);

            for (let r = 0; r < nShape.length; r++) {
                for (let c = 0; c < nShape[r].length; c++) {
                    if (nShape[r][c]) {
                        const px = previewX + c * previewCell;
                        const py = previewY + r * previewCell;
                        ctx.fillStyle = nPiece.colour;
                        ctx.fillRect(px, py, previewCell - 1, previewCell - 1);
                        ctx.font = '7px Arial, Helvetica, sans-serif';
                        ctx.fillStyle = KPMG.colours.white;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(nPiece.tax, px + previewCell / 2, py + previewCell / 2);
                    }
                }
            }
        }
        ctx.restore();

        ctx.save();
        ctx.font = '10px Arial, Helvetica, sans-serif';
        ctx.fillStyle = KPMG.colours.light;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('\u2190\u2192 Move  \u2191 Rotate  \u2193 Soft Drop  Space Hard Drop', W / 2, H - 4);
        ctx.restore();

        if (clearLabelTimer > 0 && clearLabel) {
            const alpha = Math.min(1, clearLabelTimer / 0.3);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 28px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.pacific;
            ctx.strokeStyle = KPMG.colours.blue;
            ctx.lineWidth = 2;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelY = FIELD_Y + FIELD_H / 2 - (1 - clearLabelTimer / 1.2) * 30;
            ctx.strokeText(clearLabel, FIELD_X + FIELD_W / 2, labelY);
            ctx.fillText(clearLabel, FIELD_X + FIELD_W / 2, labelY);
            ctx.restore();
        }
    }

    function drawCell(ctx, col, row, colour, tax) {
        const x = FIELD_X + col * CELL;
        const y = FIELD_Y + row * CELL;
        const inset = 1;

        ctx.fillStyle = colour;
        ctx.fillRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2);

        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x + inset, y + inset, CELL - inset * 2, 3);
        ctx.fillRect(x + inset, y + inset, 3, CELL - inset * 2);

        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(x + inset, y + CELL - inset - 2, CELL - inset * 2, 2);
        ctx.fillRect(x + CELL - inset - 2, y + inset, 2, CELL - inset * 2);

        if (tax) {
            ctx.save();
            ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
            ctx.fillStyle = KPMG.colours.white;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tax, x + CELL / 2, y + CELL / 2);
            ctx.restore();
        }
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
