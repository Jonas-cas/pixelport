/**
 * breakout.js
 *
 * Spiellogik für Breakout. Einzelspieler, daher hat der Vorbildschirm nur
 * eine Schwierigkeits- (kein Modus-) Auswahl - renderSetup() unterstützt das,
 * indem man modes einfach weglässt.
 *
 * Schwierigkeit wirkt sich auf zwei Dinge aus (DIFFICULTY_SETTINGS):
 * Ballgeschwindigkeit und Schlägergröße.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=spiele-1990";

  const HOW_TO_PLAY =
    "Mit einem beweglichen Schläger am unteren Rand hältst du einen Ball im Spiel. Der Ball soll die bunten Steine am oberen Bildschirmrand zerstören, indem er sie trifft. Fällt der Ball nach unten durch, ohne dass du ihn triffst, verlierst du ein Leben. Sind alle Steine zerstört, hast du gewonnen.";

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> konkrete Breakout-Werte.
  const DIFFICULTY_SETTINGS = {
    1: { ballSpeed: 260, paddleWidth: 150 },
    2: { ballSpeed: 300, paddleWidth: 130 },
    3: { ballSpeed: 340, paddleWidth: 110 },
    4: { ballSpeed: 400, paddleWidth: 90 },
    5: { ballSpeed: 460, paddleWidth: 70 },
  };

  const START_LIVES = 3;
  const PADDLE_HEIGHT = 14;
  const PADDLE_SPEED = 480; // px/s
  const PADDLE_BOTTOM_MARGIN = 30;
  const BALL_RADIUS = 7;
  const MAX_BOUNCE_ANGLE = (65 * Math.PI) / 180;

  const BRICK_ROWS = 5;
  const BRICK_COLS = 8;
  const BRICK_MARGIN = 24;
  const BRICK_GAP = 6;
  const BRICK_TOP = 50;
  const BRICK_HEIGHT = 22;
  const ROW_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("breakout-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score-value");
  const livesEl = document.getElementById("lives-value");

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
    };
  }

  function createBricks() {
    const brickWidth = (WIDTH - BRICK_MARGIN * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;
    const bricks = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        bricks.push({
          x: BRICK_MARGIN + col * (brickWidth + BRICK_GAP),
          y: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
          width: brickWidth,
          height: BRICK_HEIGHT,
          color: ROW_COLORS[row],
          points: (BRICK_ROWS - row) * 10,
          alive: true,
        });
      }
    }
    return bricks;
  }

  function resetBallOnPaddle(s) {
    s.ball = {
      x: s.paddle.x + s.paddle.width / 2,
      y: s.paddle.y - BALL_RADIUS - 1,
      vx: 0,
      vy: 0,
      launched: false,
    };
  }

  function launchBall(s) {
    const spread = ((Math.random() * 40 - 20) * Math.PI) / 180; // -20..20 Grad von "gerade nach oben"
    s.ball.vx = s.settings.ballSpeed * Math.sin(spread);
    s.ball.vy = -s.settings.ballSpeed * Math.cos(spread);
    s.ball.launched = true;
  }

  function createState(settings) {
    const paddle = {
      x: WIDTH / 2 - settings.paddleWidth / 2,
      y: HEIGHT - PADDLE_BOTTOM_MARGIN,
      width: settings.paddleWidth,
      height: PADDLE_HEIGHT,
    };
    const s = {
      settings,
      score: 0,
      lives: START_LIVES,
      paddle,
      bricks: createBricks(),
      colors: getThemeColors(),
    };
    resetBallOnPaddle(s);
    return s;
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    livesEl.textContent = "❤️".repeat(state.lives);
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

  function movePaddle(dt) {
    const left = keys.has("arrowleft") || keys.has("a");
    const right = keys.has("arrowright") || keys.has("d");
    const direction = left && !right ? -1 : right && !left ? 1 : 0;
    state.paddle.x += direction * PADDLE_SPEED * dt;
    state.paddle.x = Math.max(0, Math.min(WIDTH - state.paddle.width, state.paddle.x));
  }

  function bounceOffPaddle() {
    const { ball, paddle } = state;
    const relativeIntersect = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    const clamped = Math.max(-1, Math.min(1, relativeIntersect));
    const bounceAngle = clamped * MAX_BOUNCE_ANGLE;
    const speed = state.settings.ballSpeed;
    ball.vx = Math.sin(bounceAngle) * speed;
    ball.vy = -Math.cos(bounceAngle) * speed;
    ball.y = paddle.y - BALL_RADIUS - 1;
  }

  function handleBrickCollisions() {
    const { ball, bricks } = state;
    for (const brick of bricks) {
      if (!brick.alive) continue;

      const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
      const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;

      if (dx * dx + dy * dy > BALL_RADIUS * BALL_RADIUS) continue;

      brick.alive = false;
      state.score += brick.points;
      updateHud();

      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx *= -1;
      } else {
        ball.vy *= -1;
      }
      break; // nur ein Stein pro Frame, sonst können Mehrfachtreffer den Winkel verfälschen
    }

    if (bricks.every((b) => !b.alive)) {
      endGame(true);
    }
  }

  function moveBall(dt) {
    const { ball, paddle } = state;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - BALL_RADIUS < 0) {
      ball.x = BALL_RADIUS;
      ball.vx *= -1;
    } else if (ball.x + BALL_RADIUS > WIDTH) {
      ball.x = WIDTH - BALL_RADIUS;
      ball.vx *= -1;
    }
    if (ball.y - BALL_RADIUS < 0) {
      ball.y = BALL_RADIUS;
      ball.vy *= -1;
    }

    // Schläger nur treffen, wenn der Ball gerade nach unten fliegt (kein Doppel-Bounce).
    if (
      ball.vy > 0 &&
      ball.y + BALL_RADIUS >= paddle.y &&
      ball.y - BALL_RADIUS <= paddle.y + paddle.height &&
      ball.x >= paddle.x - BALL_RADIUS &&
      ball.x <= paddle.x + paddle.width + BALL_RADIUS
    ) {
      bounceOffPaddle();
    }

    handleBrickCollisions();
    if (state.finished) return;

    if (ball.y - BALL_RADIUS > HEIGHT) {
      state.lives -= 1;
      updateHud();
      if (state.lives <= 0) {
        endGame(false);
      } else {
        resetBallOnPaddle(state);
      }
    }
  }

  function update(dt) {
    movePaddle(dt);

    if (!state.ball.launched) {
      state.ball.x = state.paddle.x + state.paddle.width / 2;
      return;
    }

    moveBall(dt);
  }

  function render() {
    const { colors } = state;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    state.bricks.forEach((brick) => {
      if (!brick.alive) return;
      ctx.fillStyle = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    });

    ctx.fillStyle = colors.fg;
    ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height);

    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    if (!state.ball.launched) {
      ctx.fillStyle = colors.fg;
      ctx.font = "600 18px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Leertaste für den Aufschlag", WIDTH / 2, state.paddle.y - 30);
    }
  }

  function endGame(won) {
    state.finished = true;
    cancelAnimationFrame(animationFrame);

    PixelPortGameScreens.renderResult(resultScreen, {
      title: won ? "🏆 Gewonnen!" : "💥 Game Over",
      message: `Punktestand: ${state.score}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Breakout",
      intro: "Wähle die Schwierigkeit, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      defaultDifficultyId: 3,
      backHref: CATEGORY_URL,
      backLabel: "← Zurück zu 1990er Spiele",
      onStart: startGame,
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "d" || key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      keys.add(key);
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (state && !state.finished && !state.ball.launched) {
        launchBall(state);
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  showScreen(setupScreen);
  initSetup();
})();
