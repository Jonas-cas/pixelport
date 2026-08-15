/**
 * space-invaders.js
 *
 * Klassisches Space Invaders: eine Formation aus Gegnern bewegt sich als
 * Block seitlich, kehrt an den Rändern um und rückt dabei eine Reihe
 * weiter nach unten vor (Lockstep-Bewegung wie im Original-Automaten).
 * Der Spieler bewegt sich unten seitlich und schießt nach oben, Gegner
 * feuern zufällig zurück. Einzelspieler, daher hat der Vorbildschirm nur
 * eine Schwierigkeits- (kein Modus-) Auswahl.
 *
 * Schwierigkeit wirkt sich auf zwei Dinge aus (DIFFICULTY_SETTINGS):
 * Geschwindigkeit der Gegner-Formation und Schussfrequenz der Gegner.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=spiele-1990";

  const HOW_TO_PLAY =
    "Am unteren Bildschirmrand steuerst du ein Raumschiff und schießt auf Reihen von Alien-Gegnern, die sich langsam nach unten bewegen. Ziel ist es, alle Aliens abzuschießen, bevor sie den unteren Rand erreichen. Weiche dabei den Schüssen der Gegner aus.";

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Formations-Tempo + Gegner-Schussfrequenz.
  const DIFFICULTY_SETTINGS = {
    1: { moveInterval: 650, fireInterval: 1700 },
    2: { moveInterval: 520, fireInterval: 1300 },
    3: { moveInterval: 400, fireInterval: 1000 },
    4: { moveInterval: 290, fireInterval: 720 },
    5: { moveInterval: 190, fireInterval: 480 },
  };

  const ROWS = 5;
  const COLS = 8;
  const SPACING_X = 70;
  const SPACING_Y = 45;
  const ENEMY_W = 38;
  const ENEMY_H = 26;
  const MARGIN = 30;
  const STEP_X = 12;
  const STEP_DOWN = 16;
  const ROW_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];
  const ROW_POINTS = [50, 40, 30, 20, 10];

  const PLAYER_WIDTH = 46;
  const PLAYER_HEIGHT = 18;
  const PLAYER_SPEED = 340;
  const PLAYER_BULLET_SPEED = 460;
  const ENEMY_BULLET_SPEED = 240;
  const SHOT_COOLDOWN = 0.35;
  const INVULN_TIME = 1.1;
  const START_LIVES = 3;

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("si-canvas");
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

  function createEnemies() {
    const enemies = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        enemies.push({ row, col, alive: true });
      }
    }
    return enemies;
  }

  function createState(settings) {
    return {
      settings,
      player: { x: WIDTH / 2 - PLAYER_WIDTH / 2, y: HEIGHT - 34, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
      playerBullets: [],
      enemyBullets: [],
      enemies: createEnemies(),
      formation: { offsetX: MARGIN + ENEMY_W / 2, offsetY: 50, dir: 1 },
      moveAccumulator: 0,
      fireAccumulator: 0,
      shotCooldown: 0,
      invulnTimer: 0,
      lives: START_LIVES,
      score: 0,
      finished: false,
      colors: getThemeColors(),
    };
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    livesEl.textContent = "❤️".repeat(Math.max(0, state.lives));
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

  function enemyPos(enemy) {
    return {
      x: state.formation.offsetX + enemy.col * SPACING_X,
      y: state.formation.offsetY + enemy.row * SPACING_Y,
    };
  }

  function aliveEnemies() {
    return state.enemies.filter((e) => e.alive);
  }

  function updateFormation(dt) {
    const alive = aliveEnemies();
    if (alive.length === 0) return;

    state.moveAccumulator += dt;
    const interval = state.settings.moveInterval / 1000;
    if (state.moveAccumulator < interval) return;
    state.moveAccumulator -= interval;

    const cols = alive.map((e) => e.col);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const nextOffsetX = state.formation.offsetX + STEP_X * state.formation.dir;
    const leftEdge = nextOffsetX + minCol * SPACING_X - ENEMY_W / 2;
    const rightEdge = nextOffsetX + maxCol * SPACING_X + ENEMY_W / 2;

    if (leftEdge < MARGIN || rightEdge > WIDTH - MARGIN) {
      state.formation.dir *= -1;
      state.formation.offsetY += STEP_DOWN;
    } else {
      state.formation.offsetX = nextOffsetX;
    }

    const rows = alive.map((e) => e.row);
    const maxRow = Math.max(...rows);
    const frontY = state.formation.offsetY + maxRow * SPACING_Y;
    if (frontY + ENEMY_H / 2 >= state.player.y) {
      endGame(false, "invasion");
    }
  }

  function updateEnemyFire(dt) {
    const alive = aliveEnemies();
    if (alive.length === 0) return;

    state.fireAccumulator += dt;
    const interval = state.settings.fireInterval / 1000;
    if (state.fireAccumulator < interval) return;
    state.fireAccumulator -= interval * (0.7 + Math.random() * 0.6);

    const columns = {};
    alive.forEach((e) => {
      if (!columns[e.col] || e.row > columns[e.col].row) columns[e.col] = e;
    });
    const shooters = Object.values(columns);
    const shooter = shooters[Math.floor(Math.random() * shooters.length)];
    const pos = enemyPos(shooter);
    state.enemyBullets.push({ x: pos.x, y: pos.y + ENEMY_H / 2 });
  }

  function updatePlayer(dt) {
    const left = keys.has("arrowleft") || keys.has("a");
    const right = keys.has("arrowright") || keys.has("d");
    const direction = left && !right ? -1 : right && !left ? 1 : 0;
    state.player.x += direction * PLAYER_SPEED * dt;
    state.player.x = Math.max(0, Math.min(WIDTH - state.player.width, state.player.x));

    if (state.shotCooldown > 0) state.shotCooldown -= dt;
    if (keys.has(" ") && state.shotCooldown <= 0) {
      state.shotCooldown = SHOT_COOLDOWN;
      state.playerBullets.push({ x: state.player.x + state.player.width / 2, y: state.player.y });
    }

    if (state.invulnTimer > 0) state.invulnTimer -= dt;
  }

  function updateBullets(dt) {
    state.playerBullets.forEach((b) => (b.y -= PLAYER_BULLET_SPEED * dt));
    state.playerBullets = state.playerBullets.filter((b) => b.y > -10);

    state.enemyBullets.forEach((b) => (b.y += ENEMY_BULLET_SPEED * dt));
    state.enemyBullets = state.enemyBullets.filter((b) => b.y < HEIGHT + 10);
  }

  function handleCollisions() {
    for (const bullet of state.playerBullets) {
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const pos = enemyPos(enemy);
        if (Math.abs(bullet.x - pos.x) <= ENEMY_W / 2 && Math.abs(bullet.y - pos.y) <= ENEMY_H / 2) {
          enemy.alive = false;
          bullet.hit = true;
          state.score += ROW_POINTS[enemy.row] || 10;
          updateHud();
          break;
        }
      }
    }
    state.playerBullets = state.playerBullets.filter((b) => !b.hit);

    if (aliveEnemies().length === 0) {
      endGame(true, "cleared");
      return;
    }

    if (state.invulnTimer <= 0) {
      for (const bullet of state.enemyBullets) {
        const p = state.player;
        if (
          bullet.x >= p.x - 4 &&
          bullet.x <= p.x + p.width + 4 &&
          bullet.y >= p.y - 4 &&
          bullet.y <= p.y + p.height + 4
        ) {
          bullet.hit = true;
          state.lives -= 1;
          state.invulnTimer = INVULN_TIME;
          updateHud();
          if (state.lives <= 0) {
            endGame(false, "destroyed");
          }
          break;
        }
      }
      state.enemyBullets = state.enemyBullets.filter((b) => !b.hit);
    }
  }

  function update(dt) {
    updatePlayer(dt);
    updateFormation(dt);
    if (state.finished) return;
    updateEnemyFire(dt);
    updateBullets(dt);
    handleCollisions();
  }

  function render() {
    const { colors } = state;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    state.enemies.forEach((enemy) => {
      if (!enemy.alive) return;
      const pos = enemyPos(enemy);
      ctx.fillStyle = ROW_COLORS[enemy.row];
      ctx.fillRect(pos.x - ENEMY_W / 2, pos.y - ENEMY_H / 2, ENEMY_W, ENEMY_H);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(pos.x - ENEMY_W / 2 + 7, pos.y - 4, 6, 6);
      ctx.fillRect(pos.x + ENEMY_W / 2 - 13, pos.y - 4, 6, 6);
    });

    const playerFlash = state.invulnTimer > 0 && Math.floor(state.invulnTimer * 10) % 2 === 0;
    if (!playerFlash) {
      ctx.fillStyle = colors.fg;
      const p = state.player;
      ctx.fillRect(p.x, p.y + p.height * 0.4, p.width, p.height * 0.6);
      ctx.fillRect(p.x + p.width / 2 - 4, p.y, 8, p.height * 0.6);
    }

    ctx.fillStyle = colors.accent;
    state.playerBullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 8, 4, 12));

    ctx.fillStyle = "#ef4444";
    state.enemyBullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 6, 4, 10));
  }

  function endGame(won, reason) {
    state.finished = true;
    cancelAnimationFrame(animationFrame);

    const title = won ? "🏆 Gewonnen!" : reason === "invasion" ? "👾 Invasion!" : "💥 Game Over";
    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message: `Punktestand: ${state.score}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Space Invaders",
      icon: "👾",
      intro: "Wähle die Schwierigkeit, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      defaultDifficultyId: 3,
      onStart: startGame,
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "d" || key === "arrowleft" || key === "arrowright" || event.code === "Space") {
      event.preventDefault();
      keys.add(event.code === "Space" ? " " : key);
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    keys.delete(event.code === "Space" ? " " : key);
  });

  showScreen(setupScreen);
  initSetup();
})();
