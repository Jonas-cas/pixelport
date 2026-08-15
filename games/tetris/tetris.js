/**
 * tetris.js
 *
 * Klassisches Tetris mit den 7 Standard-Tetrominos (I/O/T/S/Z/J/L),
 * Rotation mit einfachem Wandkick, 7-Bag-Zufallsgenerator (fairer als
 * reiner Zufall - jeder Stein kommt garantiert einmal pro 7er-Satz vor),
 * Zeilen-Löschung mit klassischem Punktesystem und Ghost-Piece (zeigt
 * die Landeposition). Einzelspieler, daher hat der Vorbildschirm nur
 * eine Schwierigkeits- (kein Modus-) Auswahl.
 *
 * Schwierigkeit wirkt sich auf die Fallgeschwindigkeit aus
 * (DIFFICULTY_SETTINGS: Gravitations-Intervall).
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=spiele-1990";

  const HOW_TO_PLAY =
    "Verschiedene Blockformen fallen von oben ins Spielfeld. Du drehst und verschiebst sie, damit sie möglichst lückenlos ganze Reihen füllen. Volle Reihen verschwinden und bringen Punkte - stapeln sich die Blöcke bis nach oben, ist das Spiel vorbei.";

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Fallgeschwindigkeit (ms pro Reihe).
  const DIFFICULTY_SETTINGS = {
    1: { gravityInterval: 900 },
    2: { gravityInterval: 650 },
    3: { gravityInterval: 480 },
    4: { gravityInterval: 320 },
    5: { gravityInterval: 180 },
  };

  const BOARD_COLS = 10;
  const BOARD_ROWS = 20;
  const CELL = 30;
  const SOFT_DROP_INTERVAL = 45;
  const LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

  // Jede Rotation ist eine Liste von [row, col]-Zellen innerhalb eines
  // kleinen lokalen Rasters (Standard-Tetromino-Rotationsformen).
  const PIECES = {
    I: {
      color: "#22d3ee",
      rotations: [
        [[1, 0], [1, 1], [1, 2], [1, 3]],
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[2, 0], [2, 1], [2, 2], [2, 3]],
        [[0, 1], [1, 1], [2, 1], [3, 1]],
      ],
    },
    O: {
      color: "#eab308",
      rotations: [
        [[0, 1], [0, 2], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [1, 2]],
      ],
    },
    T: {
      color: "#a855f7",
      rotations: [
        [[0, 1], [1, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [1, 2], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 1]],
        [[0, 1], [1, 0], [1, 1], [2, 1]],
      ],
    },
    S: {
      color: "#22c55e",
      rotations: [
        [[0, 1], [0, 2], [1, 0], [1, 1]],
        [[0, 1], [1, 1], [1, 2], [2, 2]],
        [[1, 1], [1, 2], [2, 0], [2, 1]],
        [[0, 0], [1, 0], [1, 1], [2, 1]],
      ],
    },
    Z: {
      color: "#ef4444",
      rotations: [
        [[0, 0], [0, 1], [1, 1], [1, 2]],
        [[0, 2], [1, 1], [1, 2], [2, 1]],
        [[1, 0], [1, 1], [2, 1], [2, 2]],
        [[0, 1], [1, 0], [1, 1], [2, 0]],
      ],
    },
    J: {
      color: "#3b82f6",
      rotations: [
        [[0, 0], [1, 0], [1, 1], [1, 2]],
        [[0, 1], [0, 2], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 2]],
        [[0, 1], [1, 1], [2, 0], [2, 1]],
      ],
    },
    L: {
      color: "#f97316",
      rotations: [
        [[0, 2], [1, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [2, 2]],
        [[1, 0], [1, 1], [1, 2], [2, 0]],
        [[0, 0], [0, 1], [1, 1], [2, 1]],
      ],
    },
  };
  const PIECE_TYPES = Object.keys(PIECES);

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("tetris-canvas");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("tetris-next");
  const nextCtx = nextCanvas.getContext("2d");
  const scoreEl = document.getElementById("score-value");

  let state = null;
  let lastSelection = null;
  let animationFrame = null;
  let lastTime = 0;
  const keys = new Set();

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function createEmptyBoard() {
    return Array.from({ length: BOARD_ROWS }, () => new Array(BOARD_COLS).fill(null));
  }

  function shuffledBag() {
    const bag = PIECE_TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  function takeNextType(s) {
    if (s.bag.length === 0) s.bag = shuffledBag();
    return s.bag.shift();
  }

  function spawnPiece(s) {
    const type = s.nextType;
    s.nextType = takeNextType(s);
    return { type, rotation: 0, row: 0, col: 3 };
  }

  function collides(board, type, rotation, row, col) {
    const cells = PIECES[type].rotations[rotation];
    for (const [r, c] of cells) {
      const br = row + r;
      const bc = col + c;
      if (bc < 0 || bc >= BOARD_COLS || br >= BOARD_ROWS) return true;
      if (br >= 0 && board[br][bc]) return true;
    }
    return false;
  }

  function createState(settings) {
    const s = {
      settings,
      board: createEmptyBoard(),
      bag: shuffledBag(),
      score: 0,
      gravityAccumulator: 0,
      finished: false,
    };
    s.nextType = takeNextType(s);
    s.piece = spawnPiece(s);
    return s;
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
  }

  function startGame(selection) {
    lastSelection = selection;
    const settings = DIFFICULTY_SETTINGS[selection.difficulty.id];
    state = createState(settings);

    updateHud();
    showScreen(playScreen);

    cancelAnimationFrame(animationFrame);
    lastTime = performance.now();
    animationFrame = requestAnimationFrame(loop);
  }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);
    render();

    if (state.finished) return;
    animationFrame = requestAnimationFrame(loop);
  }

  function tryMove(dRow, dCol) {
    const p = state.piece;
    if (!collides(state.board, p.type, p.rotation, p.row + dRow, p.col + dCol)) {
      p.row += dRow;
      p.col += dCol;
      return true;
    }
    return false;
  }

  function tryRotate() {
    const p = state.piece;
    const newRotation = (p.rotation + 1) % 4;
    for (const dc of [0, -1, 1, -2, 2]) {
      if (!collides(state.board, p.type, newRotation, p.row, p.col + dc)) {
        p.rotation = newRotation;
        p.col += dc;
        return true;
      }
    }
    return false;
  }

  function clearLines() {
    let cleared = 0;
    let r = BOARD_ROWS - 1;
    while (r >= 0) {
      if (state.board[r].every((cell) => cell !== null)) {
        state.board.splice(r, 1);
        state.board.unshift(new Array(BOARD_COLS).fill(null));
        cleared++;
      } else {
        r--;
      }
    }
    return cleared;
  }

  function lockPiece() {
    const p = state.piece;
    const cells = PIECES[p.type].rotations[p.rotation];
    for (const [r, c] of cells) {
      const br = p.row + r;
      const bc = p.col + c;
      if (br >= 0) state.board[br][bc] = PIECES[p.type].color;
    }

    const cleared = clearLines();
    if (cleared > 0) {
      state.score += LINE_SCORES[cleared] || 0;
      updateHud();
    }

    const next = spawnPiece(state);
    if (collides(state.board, next.type, next.rotation, next.row, next.col)) {
      state.piece = next;
      endGame();
      return;
    }
    state.piece = next;
  }

  function hardDrop() {
    while (tryMove(1, 0)) {
      /* fällt weiter, bis Kollision */
    }
    lockPiece();
  }

  function update(dt) {
    const softDrop = keys.has("arrowdown") || keys.has("s");
    const interval = (softDrop ? SOFT_DROP_INTERVAL : state.settings.gravityInterval) / 1000;

    state.gravityAccumulator += dt;
    while (state.gravityAccumulator >= interval) {
      state.gravityAccumulator -= interval;
      if (!tryMove(1, 0)) {
        lockPiece();
        if (state.finished) return;
      }
    }
  }

  function ghostRow() {
    const p = state.piece;
    let row = p.row;
    while (!collides(state.board, p.type, p.rotation, row + 1, p.col)) row++;
    return row;
  }

  function drawCell(context, x, y, size, color) {
    context.fillStyle = color;
    context.fillRect(x, y, size - 2, size - 2);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const color = state.board[r][c];
        if (color) drawCell(ctx, c * CELL, r * CELL, CELL, color);
      }
    }

    const p = state.piece;
    const cells = PIECES[p.type].rotations[p.rotation];

    const gr = ghostRow();
    ctx.globalAlpha = 0.25;
    for (const [r, c] of cells) {
      const br = gr + r;
      const bc = p.col + c;
      if (br >= 0) drawCell(ctx, bc * CELL, br * CELL, CELL, PIECES[p.type].color);
    }
    ctx.globalAlpha = 1;

    for (const [r, c] of cells) {
      const br = p.row + r;
      const bc = p.col + c;
      if (br >= 0) drawCell(ctx, bc * CELL, br * CELL, CELL, PIECES[p.type].color);
    }

    renderNext();
  }

  function renderNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const type = state.nextType;
    const cells = PIECES[type].rotations[0];
    const size = 20;
    const maxCol = Math.max(...cells.map(([, c]) => c));
    const maxRow = Math.max(...cells.map(([r]) => r));
    const offsetX = (nextCanvas.width - (maxCol + 1) * size) / 2;
    const offsetY = (nextCanvas.height - (maxRow + 1) * size) / 2;
    for (const [r, c] of cells) {
      drawCell(nextCtx, offsetX + c * size, offsetY + r * size, size, PIECES[type].color);
    }
  }

  function endGame() {
    state.finished = true;
    cancelAnimationFrame(animationFrame);

    PixelPortGameScreens.renderResult(resultScreen, {
      title: "💥 Game Over",
      message: `Punktestand: ${state.score}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Tetris",
      intro: "Wähle die Schwierigkeit, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      defaultDifficultyId: 3,
      onStart: startGame,
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const isGameKey =
      key === "arrowleft" || key === "a" || key === "arrowright" || key === "d" ||
      key === "arrowdown" || key === "s" || key === "arrowup" || key === "w" ||
      event.code === "Space";
    if (!isGameKey) return;
    event.preventDefault();
    if (!state || state.finished) return;

    if (key === "arrowleft" || key === "a") tryMove(0, -1);
    else if (key === "arrowright" || key === "d") tryMove(0, 1);
    else if (key === "arrowup" || key === "w") tryRotate();
    else if (event.code === "Space") hardDrop();
    else if (key === "arrowdown" || key === "s") keys.add(key);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  showScreen(setupScreen);
  initSetup();
})();
