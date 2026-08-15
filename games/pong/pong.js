/**
 * pong.js
 *
 * Spiellogik für Pong. Nutzt js/game-screens.js für den Vorbildschirm
 * (Schwierigkeit + Modus) und den Ergebnis-Bildschirm - siehe dort für das
 * wiederverwendbare Auswahl-System, das auch künftige Spiele nutzen sollen.
 *
 * Schwierigkeit wirkt sich bei Pong auf drei Dinge aus (DIFFICULTY_SETTINGS):
 * Ballgeschwindigkeit, Schlägergröße und Stärke/Genauigkeit des Bots.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=spiele-1990";
  const WINNING_SCORE = 10;

  const HOW_TO_PLAY =
    "Zwei Schläger, einer links und einer rechts, bewegen sich rauf und runter. Ihr müsst den Ball mit eurem Schläger zurückschlagen, bevor er hinter euch vorbeifliegt. Verfehlt ihr den Ball, bekommt der Gegner einen Punkt. Wer zuerst 10 Punkte erreicht, gewinnt.";

  const MODES = [
    { id: "2p", label: "2 Spieler", description: "Beide Schläger werden von Menschen gesteuert." },
    { id: "bot", label: "Gegen Bot", description: "Der rechte Schläger wird von einer KI gesteuert." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> konkrete Pong-Werte.
  const DIFFICULTY_SETTINGS = {
    1: { ballSpeed: 260, paddleHeightRatio: 0.24, botAccuracy: 0.45, botReaction: 0.5 },
    2: { ballSpeed: 320, paddleHeightRatio: 0.2, botAccuracy: 0.6, botReaction: 0.35 },
    3: { ballSpeed: 380, paddleHeightRatio: 0.17, botAccuracy: 0.75, botReaction: 0.22 },
    4: { ballSpeed: 460, paddleHeightRatio: 0.14, botAccuracy: 0.88, botReaction: 0.12 },
    5: { ballSpeed: 560, paddleHeightRatio: 0.11, botAccuracy: 0.97, botReaction: 0.05 },
  };

  const PADDLE_WIDTH = 14;
  const PADDLE_MARGIN = 24;
  const PADDLE_SPEED = 420; // px/s
  const BALL_RADIUS = 8;
  const MAX_BOUNCE_ANGLE = (60 * Math.PI) / 180;
  const SERVE_DELAY = 0.6; // Sekunden Pause vor jedem Aufschlag

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("pong-canvas");
  const ctx = canvas.getContext("2d");
  const scoreLeftEl = document.getElementById("score-left");
  const scoreRightEl = document.getElementById("score-right");
  const hintEl = document.getElementById("game-hint");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

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

  function getThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      fg: styles.getPropertyValue("--text").trim() || "#eceef5",
      accent: styles.getPropertyValue("--accent").trim() || "#a855f7",
      line: styles.getPropertyValue("--border").trim() || "rgba(255,255,255,0.2)",
    };
  }

  function makeServe(settings, direction) {
    const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // leichte Zufallsrichtung
    return {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      vx: Math.cos(angle) * settings.ballSpeed * direction,
      vy: Math.sin(angle) * settings.ballSpeed,
      speed: settings.ballSpeed,
    };
  }

  function createState(settings, mode) {
    const paddleHeight = HEIGHT * settings.paddleHeightRatio;
    return {
      settings,
      mode, // "2p" | "bot"
      score: { left: 0, right: 0 },
      left: { y: HEIGHT / 2 - paddleHeight / 2, height: paddleHeight },
      right: { y: HEIGHT / 2 - paddleHeight / 2, height: paddleHeight },
      ball: makeServe(settings, Math.random() < 0.5 ? -1 : 1),
      bot: { targetY: HEIGHT / 2, nextUpdate: 0 },
      serveDelay: SERVE_DELAY,
      colors: getThemeColors(),
    };
  }

  function updateHint(modeId) {
    hintEl.textContent =
      modeId === "bot"
        ? "Du: W / S   ·   Gegner: Bot"
        : "Spieler 1: W / S   ·   Spieler 2: ↑ / ↓";
  }

  function updateScoreboard() {
    scoreLeftEl.textContent = String(state.score.left);
    scoreRightEl.textContent = String(state.score.right);
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

    if (state.score.left >= WINNING_SCORE || state.score.right >= WINNING_SCORE) {
      endGame();
      return;
    }

    animationFrame = requestAnimationFrame(loop);
  }

  function movePaddle(paddle, dt, direction) {
    paddle.y += direction * PADDLE_SPEED * dt;
    paddle.y = Math.max(0, Math.min(HEIGHT - paddle.height, paddle.y));
  }

  function updateBot(dt) {
    const { settings, ball, bot, right } = state;
    bot.nextUpdate -= dt;
    if (bot.nextUpdate <= 0) {
      // Je niedriger die Genauigkeit, desto größer die Streuung ums Ziel.
      const noise = (1 - settings.botAccuracy) * HEIGHT * 0.35;
      bot.targetY = ball.y + (Math.random() * 2 - 1) * noise;
      bot.nextUpdate = settings.botReaction;
    }

    const paddleCenter = right.y + right.height / 2;
    const diff = bot.targetY - paddleCenter;
    const direction = Math.abs(diff) < 4 ? 0 : Math.sign(diff);
    // Stärkere Bots (hohe Genauigkeit) reagieren auch etwas zügiger.
    movePaddle(right, dt, direction * (0.6 + settings.botAccuracy * 0.5));
  }

  function update(dt) {
    movePaddle(state.left, dt, keys.has("w") ? -1 : keys.has("s") ? 1 : 0);

    if (state.mode === "bot") {
      updateBot(dt);
    } else {
      movePaddle(state.right, dt, keys.has("arrowup") ? -1 : keys.has("arrowdown") ? 1 : 0);
    }

    if (state.serveDelay > 0) {
      state.serveDelay -= dt;
      return;
    }

    moveBall(dt);
  }

  function checkPaddleCollision(paddle, paddleX, dirSign) {
    const { ball } = state;
    const withinX =
      dirSign === 1
        ? ball.x - BALL_RADIUS <= paddleX + PADDLE_WIDTH && ball.x > paddleX
        : ball.x + BALL_RADIUS >= paddleX && ball.x < paddleX + PADDLE_WIDTH;
    if (!withinX) return;

    // Nur zählen, wenn der Ball sich gerade auf den Schläger zubewegt (kein Doppel-Bounce).
    if ((dirSign === 1 && ball.vx >= 0) || (dirSign === -1 && ball.vx <= 0)) return;

    const withinY = ball.y >= paddle.y - BALL_RADIUS && ball.y <= paddle.y + paddle.height + BALL_RADIUS;
    if (!withinY) return;

    const relativeIntersect = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
    const bounceAngle = relativeIntersect * MAX_BOUNCE_ANGLE;
    const speed = Math.min(ball.speed * 1.045, state.settings.ballSpeed * 1.6);

    ball.speed = speed;
    ball.vx = Math.cos(bounceAngle) * speed * dirSign;
    ball.vy = Math.sin(bounceAngle) * speed;
    ball.x = dirSign === 1 ? paddleX + PADDLE_WIDTH + BALL_RADIUS : paddleX - BALL_RADIUS;
  }

  function scorePoint(side) {
    state.score[side] += 1;
    updateScoreboard();
    state.ball = makeServe(state.settings, side === "left" ? -1 : 1);
    state.serveDelay = SERVE_DELAY;
  }

  function moveBall(dt) {
    const { ball } = state;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y - BALL_RADIUS < 0) {
      ball.y = BALL_RADIUS;
      ball.vy *= -1;
    } else if (ball.y + BALL_RADIUS > HEIGHT) {
      ball.y = HEIGHT - BALL_RADIUS;
      ball.vy *= -1;
    }

    checkPaddleCollision(state.left, PADDLE_MARGIN, 1);
    checkPaddleCollision(state.right, WIDTH - PADDLE_MARGIN - PADDLE_WIDTH, -1);

    if (ball.x < -BALL_RADIUS * 2) {
      scorePoint("right");
    } else if (ball.x > WIDTH + BALL_RADIUS * 2) {
      scorePoint("left");
    }
  }

  function render() {
    const { colors } = state;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = colors.line;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 0);
    ctx.lineTo(WIDTH / 2, HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = colors.fg;
    ctx.fillRect(PADDLE_MARGIN, state.left.y, PADDLE_WIDTH, state.left.height);
    ctx.fillRect(WIDTH - PADDLE_MARGIN - PADDLE_WIDTH, state.right.y, PADDLE_WIDTH, state.right.height);

    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function endGame() {
    cancelAnimationFrame(animationFrame);

    const winnerSide = state.score.left > state.score.right ? "left" : "right";
    const isBotMode = state.mode === "bot";
    const winnerLabel = isBotMode
      ? winnerSide === "left"
        ? "Du"
        : "Der Bot"
      : winnerSide === "left"
        ? "Spieler 1"
        : "Spieler 2";

    PixelPortGameScreens.renderResult(resultScreen, {
      title: `🏆 ${winnerLabel} gewinnt!`,
      message: `Endstand: ${state.score.left} : ${state.score.right}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Pong",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "2p",
      onStart: startGame,
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "w" || key === "s" || key === "arrowup" || key === "arrowdown") {
      event.preventDefault();
      keys.add(key);
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  showScreen(setupScreen);
  initSetup();
})();
