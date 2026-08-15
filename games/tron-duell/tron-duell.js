/**
 * tron-duell.js
 *
 * Spiellogik für Tron-Duell: zwei Lichtspuren auf einem Raster, die
 * permanent eine Spur hinterlassen. Bewegung läuft in festen "Ticks"
 * (kein Pixel-für-Pixel-Gleiten) - das hält die Kollisionsprüfung einfach
 * und fühlt sich wie das Original-Lightcycle-Spiel an.
 *
 * Schwierigkeit wirkt sich auf zwei Dinge aus (DIFFICULTY_SETTINGS):
 * Geschwindigkeit (Tick-Intervall) und Cleverness des Bots (Vorausschau
 * per Flood-Fill + Zufallsanteil).
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=duell-wasd-pfeiltasten";
  const WINNING_ROUNDS = 3;
  const ROUND_PAUSE = 1.1; // Sekunden Pause zwischen den Runden

  const HOW_TO_PLAY =
    "Zwei Spieler steuern Lichtmotorräder, die eine permanente Spur hinter sich herziehen. Fährst du gegen die Wand, deine eigene Spur oder die Spur des Gegners, verlierst du die Runde. Wer zuerst 3 Runden gewinnt, gewinnt das Duell.";

  const MODES = [
    { id: "2p", label: "2 Spieler", description: "Spieler 1 (WASD) gegen Spieler 2 (Pfeiltasten)." },
    { id: "bot", label: "Gegen Bot", description: "Spieler 2 wird von einer KI gesteuert." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> konkrete Werte.
  const DIFFICULTY_SETTINGS = {
    1: { tickInterval: 150, botLookahead: 6, botRandomness: 0.6 },
    2: { tickInterval: 125, botLookahead: 12, botRandomness: 0.3 },
    3: { tickInterval: 105, botLookahead: 20, botRandomness: 0.12 },
    4: { tickInterval: 88, botLookahead: 34, botRandomness: 0.03 },
    5: { tickInterval: 70, botLookahead: 55, botRandomness: 0 },
  };

  const CELL = 10;
  const COLS = 80;
  const ROWS = 48;
  const SPAWN_MARGIN = 10;

  const DIRS = {
    up: { dx: 0, dy: -1, name: "up" },
    down: { dx: 0, dy: 1, name: "down" },
    left: { dx: -1, dy: 0, name: "left" },
    right: { dx: 1, dy: 0, name: "right" },
  };
  const PERPENDICULARS = {
    up: [DIRS.left, DIRS.right],
    down: [DIRS.left, DIRS.right],
    left: [DIRS.up, DIRS.down],
    right: [DIRS.up, DIRS.down],
  };

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("tron-canvas");
  const ctx = canvas.getContext("2d");
  const scoreLeftEl = document.getElementById("score-left");
  const scoreRightEl = document.getElementById("score-right");
  const hintEl = document.getElementById("game-hint");

  let state = null;
  let lastSelection = null;
  let animationFrame = null;
  let lastTime = 0;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function getThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      p1: styles.getPropertyValue("--accent").trim() || "#a855f7",
      p2: styles.getPropertyValue("--accent-2").trim() || "#22d3ee",
      fg: styles.getPropertyValue("--text").trim() || "#eceef5",
    };
  }

  function isOpposite(a, b) {
    return a.dx === -b.dx && a.dy === -b.dy;
  }

  function makePlayer(row, col, dir) {
    return { row, col, dir, pendingDir: dir, alive: true };
  }

  function createGrid() {
    const grid = [];
    for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(0));
    return grid;
  }

  function startRound(s) {
    s.grid = createGrid();
    const midRow = Math.floor(ROWS / 2);
    s.p1 = makePlayer(midRow, SPAWN_MARGIN, DIRS.right);
    s.p2 = makePlayer(midRow, COLS - SPAWN_MARGIN - 1, DIRS.left);
    s.grid[s.p1.row][s.p1.col] = 1;
    s.grid[s.p2.row][s.p2.col] = 2;
    s.tickAccumulator = 0;
    s.roundPauseTimer = 0;
    s.roundMessage = "";
  }

  function createState(settings, mode) {
    const s = {
      settings,
      mode, // "2p" | "bot"
      score: { p1: 0, p2: 0 },
      finished: false,
      colors: getThemeColors(),
    };
    startRound(s);
    return s;
  }

  function updateHint(modeId) {
    hintEl.textContent =
      modeId === "bot"
        ? "Du: WASD   ·   Gegner: Bot"
        : "Spieler 1: WASD   ·   Spieler 2: ↑ ↓ ← →";
  }

  function updateScoreboard() {
    scoreLeftEl.textContent = String(state.score.p1);
    scoreRightEl.textContent = String(state.score.p2);
  }

  function startGame(selection) {
    lastSelection = selection;
    const settings = DIFFICULTY_SETTINGS[selection.difficulty.id];
    state = createState(settings, selection.mode.id);

    updateHint(selection.mode.id);
    updateScoreboard();
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

  function spaceScore(grid, startRow, startCol, cap) {
    if (startRow < 0 || startRow >= ROWS || startCol < 0 || startCol >= COLS) return -1;
    if (grid[startRow][startCol] !== 0) return -1;

    const visited = new Set([startRow + "," + startCol]);
    const queue = [[startRow, startCol]];
    let count = 0;

    while (queue.length > 0 && count < cap) {
      const [r, c] = queue.shift();
      count++;
      for (const d of [DIRS.up, DIRS.down, DIRS.left, DIRS.right]) {
        const nr = r + d.dy;
        const nc = c + d.dx;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (grid[nr][nc] !== 0) continue;
        const key = nr + "," + nc;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
    return count;
  }

  function decideBotDirection(player, grid, settings) {
    const candidates = [player.dir, ...PERPENDICULARS[player.dir.name]];
    const scored = candidates
      .map((dir) => ({
        dir,
        score: spaceScore(grid, player.row + dir.dy, player.col + dir.dx, settings.botLookahead),
      }))
      .filter((c) => c.score >= 0);

    if (scored.length === 0) return player.dir; // eingeschlossen - jede Richtung führt in eine Wand

    if (Math.random() < settings.botRandomness) {
      return scored[Math.floor(Math.random() * scored.length)].dir;
    }

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].score;
    const topChoices = scored.filter((c) => c.score >= best - 1);
    return topChoices[Math.floor(Math.random() * topChoices.length)].dir;
  }

  function tick() {
    if (state.mode === "bot") {
      state.p2.pendingDir = decideBotDirection(state.p2, state.grid, state.settings);
    }
    state.p1.dir = state.p1.pendingDir;
    state.p2.dir = state.p2.pendingDir;

    const nextP1 = { row: state.p1.row + state.p1.dir.dy, col: state.p1.col + state.p1.dir.dx };
    const nextP2 = { row: state.p2.row + state.p2.dir.dy, col: state.p2.col + state.p2.dir.dx };

    const outOfBounds = (p) => p.row < 0 || p.row >= ROWS || p.col < 0 || p.col >= COLS;
    const hitsWall = (p) => !outOfBounds(p) && state.grid[p.row][p.col] !== 0;

    let deadP1 = outOfBounds(nextP1) || hitsWall(nextP1);
    let deadP2 = outOfBounds(nextP2) || hitsWall(nextP2);

    // Beide fahren gleichzeitig in dasselbe freie Feld -> Kopf-an-Kopf-Crash.
    if (!deadP1 && !deadP2 && nextP1.row === nextP2.row && nextP1.col === nextP2.col) {
      deadP1 = true;
      deadP2 = true;
    }

    if (!deadP1) {
      state.p1.row = nextP1.row;
      state.p1.col = nextP1.col;
      state.grid[nextP1.row][nextP1.col] = 1;
    }
    if (!deadP2) {
      state.p2.row = nextP2.row;
      state.p2.col = nextP2.col;
      state.grid[nextP2.row][nextP2.col] = 2;
    }

    if (deadP1 || deadP2) {
      resolveRoundEnd(deadP1, deadP2);
    }
  }

  function resolveRoundEnd(deadP1, deadP2) {
    if (deadP1 && deadP2) {
      state.roundMessage = "🤝 Unentschieden!";
    } else if (deadP1) {
      state.score.p2 += 1;
      state.roundMessage = state.mode === "bot" ? "Der Bot gewinnt die Runde!" : "Spieler 2 gewinnt die Runde!";
    } else {
      state.score.p1 += 1;
      state.roundMessage = state.mode === "bot" ? "Du gewinnst die Runde!" : "Spieler 1 gewinnt die Runde!";
    }
    updateScoreboard();

    if (state.score.p1 >= WINNING_ROUNDS || state.score.p2 >= WINNING_ROUNDS) {
      endGame();
    } else {
      state.roundPauseTimer = ROUND_PAUSE;
    }
  }

  function update(dt) {
    if (state.roundPauseTimer > 0) {
      state.roundPauseTimer -= dt;
      if (state.roundPauseTimer <= 0) startRound(state);
      return;
    }

    state.tickAccumulator += dt;
    const tickInterval = state.settings.tickInterval / 1000;
    while (state.tickAccumulator >= tickInterval) {
      state.tickAccumulator -= tickInterval;
      tick();
      if (state.roundPauseTimer > 0 || state.finished) break;
    }
  }

  function render() {
    const { colors, grid } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const owner = grid[r][c];
        if (owner === 0) continue;
        ctx.fillStyle = owner === 1 ? colors.p1 : colors.p2;
        ctx.fillRect(c * CELL, r * CELL, CELL - 1, CELL - 1);
      }
    }

    if (state.roundPauseTimer > 0 && state.roundMessage) {
      ctx.fillStyle = colors.fg;
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.roundMessage, canvas.width / 2, canvas.height / 2);
    }
  }

  function endGame() {
    state.finished = true;
    cancelAnimationFrame(animationFrame);

    const winnerIsP1 = state.score.p1 > state.score.p2;
    const winnerLabel =
      state.mode === "bot" ? (winnerIsP1 ? "Du" : "Der Bot") : winnerIsP1 ? "Spieler 1" : "Spieler 2";

    PixelPortGameScreens.renderResult(resultScreen, {
      title: `🏆 ${winnerLabel} gewinnt!`,
      message: `Rundenstand: ${state.score.p1} : ${state.score.p2}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Tron-Duell",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "2p",
      onStart: startGame,
    });
  }

  const CONTROL_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];

  function trySetDir(player, newDir) {
    if (!isOpposite(newDir, player.dir)) player.pendingDir = newDir;
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!CONTROL_KEYS.includes(key)) return;
    event.preventDefault();

    if (!state || state.finished) return;

    if (key === "w") trySetDir(state.p1, DIRS.up);
    else if (key === "s") trySetDir(state.p1, DIRS.down);
    else if (key === "a") trySetDir(state.p1, DIRS.left);
    else if (key === "d") trySetDir(state.p1, DIRS.right);
    else if (state.mode === "2p") {
      if (key === "arrowup") trySetDir(state.p2, DIRS.up);
      else if (key === "arrowdown") trySetDir(state.p2, DIRS.down);
      else if (key === "arrowleft") trySetDir(state.p2, DIRS.left);
      else if (key === "arrowright") trySetDir(state.p2, DIRS.right);
    }
  });

  showScreen(setupScreen);
  initSetup();
})();
