/**
 * panzer-duell.js
 *
 * Spiellogik für Panzer-Duell: zwei Panzer auf einem Feld mit festen
 * Hindernissen, die sich gegenseitig beschießen. Bewegung läuft
 * kontinuierlich (Pixel pro Sekunde, kein Raster) - jede Richtungstaste
 * wirkt wie ein gehaltener Vektor, sodass auch diagonales Ausweichen
 * möglich ist. Die "Blickrichtung" (und damit die Schussrichtung) ist
 * immer die zuletzt gedrückte, noch gehaltene Richtungstaste.
 *
 * Steuerung: Spieler 1 WASD + Leertaste, Spieler 2 Pfeiltasten +
 * Enter/Strg. Im Bot-Modus übernimmt eine KI Spieler 2.
 *
 * Schwierigkeit wirkt sich ausschließlich auf den Bot aus
 * (DIFFICULTY_SETTINGS): Reaktionszeit (wie oft er seine Bewegung/Zielwahl
 * neu bewertet), Zielgenauigkeit (Chance, einen möglichen Schuss trotz
 * freier Schusslinie NICHT abzugeben) und Ausweich-Cleverness (Chance,
 * einem erkannten gegnerischen Schuss aktiv auszuweichen). Die
 * Panzer-Geschwindigkeit selbst ist für Mensch und Bot immer gleich.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=duell-wasd-pfeiltasten";
  const WINNING_ROUNDS = 3;
  const ROUND_PAUSE = 1.4; // Sekunden Pause zwischen den Runden

  const HOW_TO_PLAY =
    "Zwei Panzer treten auf einem Feld mit Hindernissen gegeneinander an. Spieler 1 steuert mit WASD und schießt mit der Leertaste, Spieler 2 mit den Pfeiltasten und schießt mit Enter oder Strg. Trefft ihr den gegnerischen Panzer, gewinnt ihr die Runde - weicht dabei Hindernissen und gegnerischen Schüssen aus. Wer zuerst 3 Runden gewinnt, gewinnt das Duell.";

  const MODES = [
    { id: "2p", label: "2 Spieler", description: "Spieler 1 (WASD) gegen Spieler 2 (Pfeiltasten)." },
    { id: "bot", label: "Gegen Bot", description: "Spieler 2 wird von einer KI gesteuert." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Bot-Verhalten.
  const DIFFICULTY_SETTINGS = {
    1: { reactionTime: 900, aimError: 0.55, dodgeChance: 0.1 },
    2: { reactionTime: 650, aimError: 0.35, dodgeChance: 0.3 },
    3: { reactionTime: 450, aimError: 0.2, dodgeChance: 0.5 },
    4: { reactionTime: 280, aimError: 0.08, dodgeChance: 0.7 },
    5: { reactionTime: 150, aimError: 0, dodgeChance: 0.9 },
  };

  const WIDTH = 800;
  const HEIGHT = 480;
  const TANK_SIZE = 30;
  const TANK_SPEED = 190; // px/s
  const BULLET_SPEED = 420; // px/s
  const BULLET_RADIUS = 4;
  const SHOT_COOLDOWN = 0.45; // Sekunden zwischen zwei Schüssen desselben Panzers
  const ALIGN_TOLERANCE = 14; // px, wie genau der Bot auf einer Achse ausgerichtet sein muss
  const THREAT_RANGE = 260; // px, ab wann ein gegnerischer Schuss als Gefahr gilt
  const EVADE_TIME = 0.9; // Sekunden, die der Bot an einem Hindernis vorbeimanövriert, ohne neu zu entscheiden

  const DIR_VECTORS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  // Symmetrisches Hindernis-Layout (um die Mittelachse x=400 gespiegelt),
  // damit keiner der beiden Panzer im Vorteil startet.
  const OBSTACLES = [
    { x: 340, y: 26, w: 120, h: 20 },
    { x: 340, y: 434, w: 120, h: 20 },
    { x: 246, y: 176, w: 20, h: 128 },
    { x: 534, y: 176, w: 20, h: 128 },
    { x: 389, y: 230, w: 22, h: 20 },
  ];

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("panzer-canvas");
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
      obstacle: styles.getPropertyValue("--text-secondary").trim() || "#a3a6bd",
    };
  }

  // ---- Geometrie-Hilfsfunktionen ----

  function tankRect(cx, cy) {
    const half = TANK_SIZE / 2;
    return { x: cx - half, y: cy - half, w: TANK_SIZE, h: TANK_SIZE };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function withinBounds(rect) {
    return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= WIDTH && rect.y + rect.h <= HEIGHT;
  }

  function corridorClear(x1, y1, x2, y2, axis) {
    let rect;
    if (axis === "y") {
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      rect = { x: left, y: Math.min(y1, y2) - 2, w: right - left, h: 4 };
    } else {
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      rect = { x: Math.min(x1, x2) - 2, y: top, w: 4, h: bottom - top };
    }
    return !OBSTACLES.some((o) => rectsOverlap(rect, o));
  }

  // ---- Panzer / Spielzustand ----

  function makeTank(id, x, y, facing) {
    return { id, x, y, facing, dirs: [], cooldown: 0, fireHeld: false, evadeDir: null, evadeTimer: 0 };
  }

  function startRound(s) {
    const midY = HEIGHT / 2;
    s.p1 = makeTank("p1", 55, midY, "right");
    s.p2 = makeTank("p2", WIDTH - 55, midY, "left");
    s.bullets = [];
    s.roundPauseTimer = 0;
    s.roundMessage = "";
    s.botThinkTimer = 0;
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
        ? "Du: WASD + Leertaste   ·   Gegner: Bot"
        : "Spieler 1: WASD + Leertaste   ·   Spieler 2: Pfeiltasten + Enter/Strg";
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

  // ---- Bewegung ----

  function velocityFromDirs(dirs) {
    let vx = 0;
    let vy = 0;
    dirs.forEach((d) => {
      vx += DIR_VECTORS[d].dx;
      vy += DIR_VECTORS[d].dy;
    });
    const len = Math.hypot(vx, vy);
    if (len === 0) return { vx: 0, vy: 0 };
    return { vx: (vx / len) * TANK_SPEED, vy: (vy / len) * TANK_SPEED };
  }

  function moveTank(tank, otherTank, dt) {
    const { vx, vy } = velocityFromDirs(tank.dirs);
    if (vx !== 0) {
      const rect = tankRect(tank.x + vx * dt, tank.y);
      if (withinBounds(rect) && !OBSTACLES.some((o) => rectsOverlap(rect, o)) && !rectsOverlap(rect, tankRect(otherTank.x, otherTank.y))) {
        tank.x += vx * dt;
      }
    }
    if (vy !== 0) {
      const rect = tankRect(tank.x, tank.y + vy * dt);
      if (withinBounds(rect) && !OBSTACLES.some((o) => rectsOverlap(rect, o)) && !rectsOverlap(rect, tankRect(otherTank.x, otherTank.y))) {
        tank.y += vy * dt;
      }
    }
  }

  function pressDir(tank, dir) {
    if (!tank.dirs.includes(dir)) {
      tank.dirs.push(dir);
      tank.facing = dir;
    }
  }

  function releaseDir(tank, dir) {
    const idx = tank.dirs.indexOf(dir);
    if (idx === -1) return;
    tank.dirs.splice(idx, 1);
    if (tank.dirs.length > 0) tank.facing = tank.dirs[tank.dirs.length - 1];
  }

  // ---- Schießen ----

  function shoot(tank) {
    tank.cooldown = SHOT_COOLDOWN;
    const dir = DIR_VECTORS[tank.facing];
    const offset = TANK_SIZE / 2 + BULLET_RADIUS + 2;
    state.bullets.push({
      x: tank.x + dir.dx * offset,
      y: tank.y + dir.dy * offset,
      vx: dir.dx * BULLET_SPEED,
      vy: dir.dy * BULLET_SPEED,
      owner: tank.id,
    });
  }

  function handleShooting(tank, dt) {
    tank.cooldown = Math.max(0, tank.cooldown - dt);
    if (tank.fireHeld && tank.cooldown <= 0) shoot(tank);
  }

  function updateBullets(dt) {
    const remaining = [];
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < 0 || b.x > WIDTH || b.y < 0 || b.y > HEIGHT) continue;
      if (OBSTACLES.some((o) => pointInRect(b.x, b.y, o))) continue;

      const target = b.owner === "p1" ? state.p2 : state.p1;
      if (pointInRect(b.x, b.y, tankRect(target.x, target.y))) {
        resolveRoundEnd(b.owner);
        return;
      }
      remaining.push(b);
    }
    state.bullets = remaining;
  }

  function resolveRoundEnd(shooterId) {
    state.bullets = [];
    state.score[shooterId] += 1;
    const scorerLabel =
      state.mode === "bot"
        ? shooterId === "p1"
          ? "Du"
          : "Der Bot"
        : shooterId === "p1"
        ? "Spieler 1"
        : "Spieler 2";
    state.roundMessage = `🎯 ${scorerLabel} trifft!`;
    updateScoreboard();

    if (state.score.p1 >= WINNING_ROUNDS || state.score.p2 >= WINNING_ROUNDS) {
      endGame();
    } else {
      state.roundPauseTimer = ROUND_PAUSE;
    }
  }

  // ---- Bot-KI ----

  function findThreat(bot) {
    for (const b of state.bullets) {
      if (b.owner !== "p1") continue;
      if (b.vx !== 0 && Math.abs(b.y - bot.y) <= 20) {
        const approaching = (b.vx > 0 && b.x < bot.x) || (b.vx < 0 && b.x > bot.x);
        if (approaching && Math.abs(b.x - bot.x) < THREAT_RANGE) {
          return [bot.y < HEIGHT / 2 ? "down" : "up"];
        }
      }
      if (b.vy !== 0 && Math.abs(b.x - bot.x) <= 20) {
        const approaching = (b.vy > 0 && b.y < bot.y) || (b.vy < 0 && b.y > bot.y);
        if (approaching && Math.abs(b.y - bot.y) < THREAT_RANGE) {
          return [bot.x < WIDTH / 2 ? "right" : "left"];
        }
      }
    }
    return null;
  }

  // Kurzer Blick nach vorn: kann sich der Panzer gerade in diese Richtung
  // überhaupt bewegen, oder steht sofort ein Hindernis/der Gegner im Weg?
  function canMoveDir(tank, dir, otherTank) {
    const v = DIR_VECTORS[dir];
    const rect = tankRect(tank.x + v.dx * 6, tank.y + v.dy * 6);
    return (
      withinBounds(rect) &&
      !OBSTACLES.some((o) => rectsOverlap(rect, o)) &&
      !rectsOverlap(rect, tankRect(otherTank.x, otherTank.y))
    );
  }

  function decideBotAction() {
    const bot = state.p2;
    const target = state.p1;

    const dodgeDirs = findThreat(bot);
    if (dodgeDirs && Math.random() < state.settings.dodgeChance) {
      bot.dirs = dodgeDirs;
      bot.facing = dodgeDirs[dodgeDirs.length - 1];
      bot.fireHeld = false;
      return;
    }

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const alignedX = Math.abs(dx) <= ALIGN_TOLERANCE;
    const alignedY = Math.abs(dy) <= ALIGN_TOLERANCE;

    let verticalDir = alignedY ? null : dy < 0 ? "up" : "down";
    const horizontalDir = alignedX ? null : dx < 0 ? "left" : "right";

    if (bot.evadeTimer > 0) {
      // Der Bot steckte kürzlich an einem Hindernis fest - für EVADE_TIME
      // konsequent in eine Richtung weiterfahren, statt bei jeder neuen
      // Entscheidung sofort wieder umzudrehen, sobald er kurz aus der
      // Ausrichtung mit dem Gegner heraus ist (das würde sonst zu einem
      // Hin-und-her-Pendeln direkt am Hindernis führen).
      verticalDir = bot.evadeDir;
    } else {
      const attempt = [verticalDir, horizontalDir].filter(Boolean);
      const stuck = attempt.length === 0 || attempt.every((d) => !canMoveDir(bot, d, target));
      if (stuck) {
        bot.evadeDir = bot.y <= HEIGHT / 2 ? "down" : "up";
        bot.evadeTimer = EVADE_TIME;
        verticalDir = bot.evadeDir;
      }
    }

    const dirs = [verticalDir, horizontalDir].filter(Boolean);
    bot.dirs = dirs;
    if (dirs.length > 0) bot.facing = dirs[dirs.length - 1];

    let canShoot = false;
    if (alignedY && corridorClear(bot.x, bot.y, target.x, target.y, "y")) {
      bot.facing = dx < 0 ? "left" : "right";
      canShoot = true;
    } else if (alignedX && corridorClear(bot.x, bot.y, target.x, target.y, "x")) {
      bot.facing = dy < 0 ? "up" : "down";
      canShoot = true;
    }
    bot.fireHeld = canShoot && Math.random() > state.settings.aimError;
  }

  function updateBotAI(dt) {
    const bot = state.p2;
    if (bot.evadeTimer > 0) bot.evadeTimer -= dt;

    state.botThinkTimer -= dt;
    if (state.botThinkTimer <= 0) {
      state.botThinkTimer = state.settings.reactionTime / 1000;
      decideBotAction();
    }
  }

  // ---- Update / Render ----

  function update(dt) {
    if (state.roundPauseTimer > 0) {
      state.roundPauseTimer -= dt;
      if (state.roundPauseTimer <= 0) startRound(state);
      return;
    }

    if (state.mode === "bot") updateBotAI(dt);

    moveTank(state.p1, state.p2, dt);
    moveTank(state.p2, state.p1, dt);

    handleShooting(state.p1, dt);
    handleShooting(state.p2, dt);

    updateBullets(dt);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTank(tank, color) {
    const half = TANK_SIZE / 2;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    const dir = DIR_VECTORS[tank.facing];
    const barrelLength = half + 12;
    const barrelWidth = 7;
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    if (dir.dx !== 0) {
      ctx.fillRect(dir.dx > 0 ? 0 : -barrelLength, -barrelWidth / 2, barrelLength, barrelWidth);
    } else {
      ctx.fillRect(-barrelWidth / 2, dir.dy > 0 ? 0 : -barrelLength, barrelWidth, barrelLength);
    }

    ctx.fillStyle = color;
    roundRect(-half, -half, TANK_SIZE, TANK_SIZE, 7);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    roundRect(-half + 5, -half + 5, TANK_SIZE - 10, TANK_SIZE - 10, 4);
    ctx.fill();

    ctx.restore();
  }

  function render() {
    const { colors } = state;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = colors.obstacle;
    ctx.globalAlpha = 0.6;
    OBSTACLES.forEach((o) => ctx.fillRect(o.x, o.y, o.w, o.h));
    ctx.globalAlpha = 1;

    state.bullets.forEach((b) => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = b.owner === "p1" ? colors.p1 : colors.p2;
      ctx.fill();
    });

    drawTank(state.p1, colors.p1);
    drawTank(state.p2, colors.p2);

    if (state.roundPauseTimer > 0 && state.roundMessage) {
      ctx.fillStyle = colors.fg;
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.roundMessage, WIDTH / 2, HEIGHT / 2);
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
      gameName: "Panzer-Duell",
      icon: "🎯",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "2p",
      onStart: startGame,
    });
  }

  // ---- Eingabe ----

  const ALL_KEYS = ["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "enter", "control"];

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!ALL_KEYS.includes(key)) return;
    event.preventDefault();
    if (!state || state.finished) return;

    if (key === "w") pressDir(state.p1, "up");
    else if (key === "s") pressDir(state.p1, "down");
    else if (key === "a") pressDir(state.p1, "left");
    else if (key === "d") pressDir(state.p1, "right");
    else if (key === " ") state.p1.fireHeld = true;
    else if (state.mode === "2p") {
      if (key === "arrowup") pressDir(state.p2, "up");
      else if (key === "arrowdown") pressDir(state.p2, "down");
      else if (key === "arrowleft") pressDir(state.p2, "left");
      else if (key === "arrowright") pressDir(state.p2, "right");
      else if (key === "enter" || key === "control") state.p2.fireHeld = true;
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (!ALL_KEYS.includes(key)) return;
    if (!state) return;

    if (key === "w") releaseDir(state.p1, "up");
    else if (key === "s") releaseDir(state.p1, "down");
    else if (key === "a") releaseDir(state.p1, "left");
    else if (key === "d") releaseDir(state.p1, "right");
    else if (key === " ") state.p1.fireHeld = false;
    else if (state.mode === "2p") {
      if (key === "arrowup") releaseDir(state.p2, "up");
      else if (key === "arrowdown") releaseDir(state.p2, "down");
      else if (key === "arrowleft") releaseDir(state.p2, "left");
      else if (key === "arrowright") releaseDir(state.p2, "right");
      else if (key === "enter" || key === "control") state.p2.fireHeld = false;
    }
  });

  showScreen(setupScreen);
  initSetup();
})();
