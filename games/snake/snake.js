/**
 * snake.js
 *
 * Klassisches Snake: die Schlange bewegt sich in festen Ticks über ein
 * Raster (kein Pixel-Gleiten), wächst bei jedem Futter um ein Segment.
 * Game Over bei Kollision mit der Wand oder dem eigenen Körper.
 * Einzelspieler, daher hat der Vorbildschirm nur eine Schwierigkeits-
 * (kein Modus-) Auswahl.
 *
 * Schwierigkeit wirkt sich auf die Geschwindigkeit der Schlange aus
 * (DIFFICULTY_SETTINGS: Tick-Intervall).
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=spiele-1990";

  const HOW_TO_PLAY =
    "Du steuerst eine Schlange, die sich über das Spielfeld bewegt und ständig weiter wächst. Ziel ist es, Futter einzusammeln, ohne gegen die Wand oder den eigenen Schlangenkörper zu stoßen. Mit jedem gefressenen Futter wird die Schlange länger und das Spiel schwieriger.";

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Tick-Intervall in ms.
  const DIFFICULTY_SETTINGS = {
    1: { tickInterval: 200 },
    2: { tickInterval: 160 },
    3: { tickInterval: 130 },
    4: { tickInterval: 100 },
    5: { tickInterval: 75 },
  };

  const CELL = 20;
  const COLS = 40;
  const ROWS = 24;
  const POINTS_PER_FOOD = 10;

  const DIRS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };
  const CONTROL_KEYS = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("snake-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score-value");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

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
      head: styles.getPropertyValue("--accent-2").trim() || "#22d3ee",
      body: styles.getPropertyValue("--accent").trim() || "#a855f7",
    };
  }

  function isOpposite(a, b) {
    return a.dx === -b.dx && a.dy === -b.dy;
  }

  function randomFreeCell(snake) {
    const occupied = new Set(snake.map((s) => s.row + "," + s.col));
    let cell;
    do {
      cell = { row: Math.floor(Math.random() * ROWS), col: Math.floor(Math.random() * COLS) };
    } while (occupied.has(cell.row + "," + cell.col));
    return cell;
  }

  function createState(settings) {
    const midRow = Math.floor(ROWS / 2);
    const midCol = Math.floor(COLS / 2);
    const snake = [
      { row: midRow, col: midCol },
      { row: midRow, col: midCol - 1 },
      { row: midRow, col: midCol - 2 },
    ];
    return {
      settings,
      snake,
      dir: DIRS.right,
      pendingDir: DIRS.right,
      food: randomFreeCell(snake),
      score: 0,
      tickAccumulator: 0,
      finished: false,
      colors: getThemeColors(),
    };
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

  function tick() {
    state.dir = state.pendingDir;
    const head = state.snake[0];
    const newHead = { row: head.row + state.dir.dy, col: head.col + state.dir.dx };

    if (newHead.row < 0 || newHead.row >= ROWS || newHead.col < 0 || newHead.col >= COLS) {
      endGame();
      return;
    }

    const willEat = newHead.row === state.food.row && newHead.col === state.food.col;
    // Ohne Wachstum verlässt der Schwanz sein Feld in diesem Zug - dort
    // hineinzufahren ist also erlaubt, nur der Rest des Körpers zählt.
    const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);
    const hitsSelf = bodyToCheck.some((seg) => seg.row === newHead.row && seg.col === newHead.col);
    if (hitsSelf) {
      endGame();
      return;
    }

    state.snake.unshift(newHead);
    if (willEat) {
      state.score += POINTS_PER_FOOD;
      updateHud();
      state.food = randomFreeCell(state.snake);
    } else {
      state.snake.pop();
    }
  }

  function update(dt) {
    state.tickAccumulator += dt;
    const tickInterval = state.settings.tickInterval / 1000;
    while (state.tickAccumulator >= tickInterval) {
      state.tickAccumulator -= tickInterval;
      tick();
      if (state.finished) break;
    }
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#ef4444";
    const fx = state.food.col * CELL + CELL / 2;
    const fy = state.food.row * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.38, 0, Math.PI * 2);
    ctx.fill();

    state.snake.forEach((seg, index) => {
      ctx.fillStyle = index === 0 ? state.colors.head : state.colors.body;
      ctx.fillRect(seg.col * CELL + 1, seg.row * CELL + 1, CELL - 2, CELL - 2);
    });
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
      gameName: "Snake",
      intro: "Wähle die Schwierigkeit, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      defaultDifficultyId: 3,
      onStart: startGame,
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const dirName = CONTROL_KEYS[key];
    if (!dirName) return;
    event.preventDefault();
    if (!state || state.finished) return;
    const newDir = DIRS[dirName];
    if (!isOpposite(newDir, state.dir)) state.pendingDir = newDir;
  });

  showScreen(setupScreen);
  initSetup();
})();
