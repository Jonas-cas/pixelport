/**
 * air-hockey.js
 *
 * Air Hockey: ein Puck wird zwischen zwei frei beweglichen Schlägern
 * (Mallets) hin- und hergeschossen. Jeder Schläger darf sich frei in
 * beide Richtungen bewegen, ist aber auf die eigene Tischhälfte
 * beschränkt (Mittellinie darf nicht überquert werden) - anders als Pong,
 * wo die Schläger nur vertikal fahren. Der Puck prallt oben/unten immer
 * ab; links/rechts nur außerhalb der Toröffnung, innerhalb davon ist es
 * ein Tor.
 *
 * Spieler 1: WASD, Spieler 2: Pfeiltasten. Rundenbasiert wie Pong (erster
 * auf WINNING_SCORE Tore gewinnt).
 *
 * Schwierigkeit wirkt sich auf drei Dinge aus (DIFFICULTY_SETTINGS):
 * Puck-Grundgeschwindigkeit, maximale Bot-Schlägergeschwindigkeit und die
 * Reaktionszeit/Zielgenauigkeit des Bots (wie bei Panzer-Duell: der Bot
 * bewertet seine Zielposition nur alle reactionTime ms neu und trifft sie
 * mit einem Zufallsfehler, statt kontinuierlich perfekt zu tracken).
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=duell-wasd-pfeiltasten";
  const WINNING_SCORE = 7;
  const GOAL_PAUSE = 1.1; // Sekunden Pause nach einem Tor

  const HOW_TO_PLAY =
    "Ein Puck wird zwischen zwei frei beweglichen Schlägern hin- und hergeschossen. Ihr bewegt eure Schläger in alle Richtungen innerhalb eurer Tischhälfte, um den Puck ins gegnerische Tor zu befördern und das eigene zu verteidigen. Spieler 1 steuert mit WASD, Spieler 2 mit den Pfeiltasten. Wer zuerst 7 Tore erzielt, gewinnt.";

  const MODES = [
    { id: "2p", label: "2 Spieler", icon: "🧑‍🤝‍🧑", description: "Spieler 1 (WASD) gegen Spieler 2 (Pfeiltasten)." },
    { id: "bot", label: "Gegen Bot", icon: "🤖", description: "Spieler 2 wird von einer KI gesteuert." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Werte.
  const DIFFICULTY_SETTINGS = {
    1: { puckSpeed: 220, botSpeed: 150, reactionTime: 260, botError: 45 },
    2: { puckSpeed: 260, botSpeed: 190, reactionTime: 190, botError: 30 },
    3: { puckSpeed: 300, botSpeed: 230, reactionTime: 140, botError: 18 },
    4: { puckSpeed: 340, botSpeed: 270, reactionTime: 90, botError: 8 },
    5: { puckSpeed: 380, botSpeed: 310, reactionTime: 50, botError: 0 },
  };

  const WIDTH = 800;
  const HEIGHT = 480;
  const PADDLE_R = 26;
  const PUCK_R = 13;
  const GOAL_HALF = 70; // Toröffnung reicht von HEIGHT/2-GOAL_HALF bis HEIGHT/2+GOAL_HALF
  const MAX_PUCK_SPEED = 720;
  const FRICTION = 0.998; // sehr leichte Abbremsung pro Frame, damit der Puck nicht ewig kreist

  const DIR_VECTORS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("ah-canvas");
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
      border: styles.getPropertyValue("--border").trim() || "rgba(255,255,255,0.2)",
    };
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  // ---- Spielzustand ----

  function makeMallet(x, y) {
    return { x, y, vx: 0, vy: 0, dirs: [] };
  }

  function resetPositions(s) {
    s.p1 = makeMallet(120, HEIGHT / 2);
    s.p2 = makeMallet(WIDTH - 120, HEIGHT / 2);
    const angle = (Math.random() * Math.PI) / 2 - Math.PI / 4 + (Math.random() < 0.5 ? Math.PI : 0);
    s.puck = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      vx: Math.cos(angle) * s.settings.puckSpeed,
      vy: Math.sin(angle) * s.settings.puckSpeed,
    };
    s.goalPauseTimer = 0;
    s.goalMessage = "";
    s.botThinkTimer = 0;
    s.botTarget = { x: WIDTH - 120, y: HEIGHT / 2 };
  }

  function createState(settings, mode) {
    const s = {
      settings,
      mode, // "2p" | "bot"
      score: { p1: 0, p2: 0 },
      finished: false,
      colors: getThemeColors(),
    };
    resetPositions(s);
    return s;
  }

  function updateHint(modeId) {
    hintEl.textContent =
      modeId === "bot" ? "Du: WASD   ·   Gegner: Bot" : "Spieler 1: WASD   ·   Spieler 2: Pfeiltasten";
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

  function velocityFromDirs(dirs, speed) {
    let vx = 0;
    let vy = 0;
    dirs.forEach((d) => {
      vx += DIR_VECTORS[d].dx;
      vy += DIR_VECTORS[d].dy;
    });
    const len = Math.hypot(vx, vy);
    if (len === 0) return { vx: 0, vy: 0 };
    return { vx: (vx / len) * speed, vy: (vy / len) * speed };
  }

  function moveMallet(mallet, vx, vy, dt, minX, maxX) {
    mallet.vx = vx;
    mallet.vy = vy;
    mallet.x = clamp(mallet.x + vx * dt, minX, maxX);
    mallet.y = clamp(mallet.y + vy * dt, PADDLE_R, HEIGHT - PADDLE_R);
  }

  function updateBotAI(dt) {
    const bot = state.p2;
    const puck = state.puck;

    state.botThinkTimer -= dt;
    if (state.botThinkTimer <= 0) {
      state.botThinkTimer = state.settings.reactionTime / 1000;
      let targetX;
      let targetY;
      if (puck.x > WIDTH / 2 && puck.vx > -20) {
        targetX = clamp(puck.x, WIDTH / 2 + PADDLE_R, WIDTH - PADDLE_R);
        targetY = puck.y;
      } else {
        targetX = WIDTH - 150;
        targetY = HEIGHT / 2 + (puck.y - HEIGHT / 2) * 0.35;
      }
      targetY += (Math.random() * 2 - 1) * state.settings.botError;
      state.botTarget = { x: targetX, y: clamp(targetY, PADDLE_R, HEIGHT - PADDLE_R) };
    }

    const dx = state.botTarget.x - bot.x;
    const dy = state.botTarget.y - bot.y;
    const dist = Math.hypot(dx, dy);
    const vx = dist > 1 ? (dx / dist) * state.settings.botSpeed : 0;
    const vy = dist > 1 ? (dy / dist) * state.settings.botSpeed : 0;
    moveMallet(bot, vx, vy, dt, WIDTH / 2 + PADDLE_R, WIDTH - PADDLE_R);
  }

  // ---- Puck-Physik ----

  function resolvePuckWalls() {
    const puck = state.puck;
    if (puck.y - PUCK_R < 0) {
      puck.y = PUCK_R;
      puck.vy = Math.abs(puck.vy);
    } else if (puck.y + PUCK_R > HEIGHT) {
      puck.y = HEIGHT - PUCK_R;
      puck.vy = -Math.abs(puck.vy);
    }

    const inGoalRange = Math.abs(puck.y - HEIGHT / 2) < GOAL_HALF;

    if (puck.x - PUCK_R < 0) {
      if (inGoalRange) {
        resolveGoal("p2");
        return;
      }
      puck.x = PUCK_R;
      puck.vx = Math.abs(puck.vx);
    } else if (puck.x + PUCK_R > WIDTH) {
      if (inGoalRange) {
        resolveGoal("p1");
        return;
      }
      puck.x = WIDTH - PUCK_R;
      puck.vx = -Math.abs(puck.vx);
    }
  }

  function resolvePuckMallet(mallet) {
    const puck = state.puck;
    const dx = puck.x - mallet.x;
    const dy = puck.y - mallet.y;
    const dist = Math.hypot(dx, dy);
    const minDist = PUCK_R + PADDLE_R;
    if (dist === 0 || dist >= minDist) return;

    const nx = dx / dist;
    const ny = dy / dist;

    puck.x = mallet.x + nx * minDist;
    puck.y = mallet.y + ny * minDist;

    const relVx = puck.vx - mallet.vx;
    const relVy = puck.vy - mallet.vy;
    const dot = relVx * nx + relVy * ny;
    if (dot < 0) {
      puck.vx -= 2 * dot * nx;
      puck.vy -= 2 * dot * ny;
    }
    puck.vx += mallet.vx * 0.4;
    puck.vy += mallet.vy * 0.4;

    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed > MAX_PUCK_SPEED) {
      puck.vx = (puck.vx / speed) * MAX_PUCK_SPEED;
      puck.vy = (puck.vy / speed) * MAX_PUCK_SPEED;
    }
    const minSpeed = state.settings.puckSpeed * 0.6;
    if (speed < minSpeed && speed > 0) {
      puck.vx = (puck.vx / speed) * minSpeed;
      puck.vy = (puck.vy / speed) * minSpeed;
    }
  }

  function resolveGoal(scorer) {
    state.score[scorer] += 1;
    state.goalMessage = state.mode === "bot"
      ? scorer === "p1" ? "Du triffst!" : "Der Bot trifft!"
      : scorer === "p1" ? "Spieler 1 trifft!" : "Spieler 2 trifft!";
    updateScoreboard();

    if (state.score.p1 >= WINNING_SCORE || state.score.p2 >= WINNING_SCORE) {
      endGame();
    } else {
      state.goalPauseTimer = GOAL_PAUSE;
    }
  }

  function update(dt) {
    if (state.goalPauseTimer > 0) {
      state.goalPauseTimer -= dt;
      if (state.goalPauseTimer <= 0) resetPositions(state);
      return;
    }

    if (state.mode === "bot") updateBotAI(dt);
    else {
      const { vx, vy } = velocityFromDirs(state.p2.dirs, 260);
      moveMallet(state.p2, vx, vy, dt, WIDTH / 2 + PADDLE_R, WIDTH - PADDLE_R);
    }

    const { vx: p1vx, vy: p1vy } = velocityFromDirs(state.p1.dirs, 260);
    moveMallet(state.p1, p1vx, p1vy, dt, PADDLE_R, WIDTH / 2 - PADDLE_R);

    state.puck.x += state.puck.vx * dt;
    state.puck.y += state.puck.vy * dt;
    state.puck.vx *= FRICTION;
    state.puck.vy *= FRICTION;

    resolvePuckWalls();
    if (state.finished || state.goalPauseTimer > 0) return;
    resolvePuckMallet(state.p1);
    resolvePuckMallet(state.p2);
  }

  // ---- Rendering ----

  function render() {
    const { colors } = state;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Mittellinie + Mittelkreis
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 0);
    ctx.lineTo(WIDTH / 2, HEIGHT);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 60, 0, Math.PI * 2);
    ctx.stroke();

    // Tore
    ctx.fillStyle = colors.border;
    ctx.fillRect(0, HEIGHT / 2 - GOAL_HALF, 6, GOAL_HALF * 2);
    ctx.fillRect(WIDTH - 6, HEIGHT / 2 - GOAL_HALF, 6, GOAL_HALF * 2);

    // Puck
    ctx.beginPath();
    ctx.arc(state.puck.x, state.puck.y, PUCK_R, 0, Math.PI * 2);
    ctx.fillStyle = colors.fg;
    ctx.fill();

    // Schläger
    [
      { m: state.p1, color: colors.p1 },
      { m: state.p2, color: colors.p2 },
    ].forEach(({ m, color }) => {
      ctx.beginPath();
      ctx.arc(m.x, m.y, PADDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(m.x, m.y, PADDLE_R * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
    });

    if (state.goalPauseTimer > 0 && state.goalMessage) {
      ctx.fillStyle = colors.fg;
      ctx.font = "700 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.goalMessage, WIDTH / 2, HEIGHT / 2 - 90);
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
      message: `Endstand: ${state.score.p1} : ${state.score.p2}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Air Hockey",
      icon: "🏒",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "2p",
      backHref: CATEGORY_URL,
      backLabel: "← Zurück zum Duell",
      onStart: startGame,
    });
  }

  // ---- Eingabe ----

  const CONTROL_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];

  function pressDir(mallet, dir) {
    if (!mallet.dirs.includes(dir)) mallet.dirs.push(dir);
  }

  function releaseDir(mallet, dir) {
    const idx = mallet.dirs.indexOf(dir);
    if (idx !== -1) mallet.dirs.splice(idx, 1);
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (!CONTROL_KEYS.includes(key)) return;
    event.preventDefault();
    if (!state || state.finished) return;

    if (key === "w") pressDir(state.p1, "up");
    else if (key === "s") pressDir(state.p1, "down");
    else if (key === "a") pressDir(state.p1, "left");
    else if (key === "d") pressDir(state.p1, "right");
    else if (state.mode === "2p") {
      if (key === "arrowup") pressDir(state.p2, "up");
      else if (key === "arrowdown") pressDir(state.p2, "down");
      else if (key === "arrowleft") pressDir(state.p2, "left");
      else if (key === "arrowright") pressDir(state.p2, "right");
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (!CONTROL_KEYS.includes(key)) return;
    if (!state) return;

    if (key === "w") releaseDir(state.p1, "up");
    else if (key === "s") releaseDir(state.p1, "down");
    else if (key === "a") releaseDir(state.p1, "left");
    else if (key === "d") releaseDir(state.p1, "right");
    else if (state.mode === "2p") {
      if (key === "arrowup") releaseDir(state.p2, "up");
      else if (key === "arrowdown") releaseDir(state.p2, "down");
      else if (key === "arrowleft") releaseDir(state.p2, "left");
      else if (key === "arrowright") releaseDir(state.p2, "right");
    }
  });

  showScreen(setupScreen);
  initSetup();
})();
