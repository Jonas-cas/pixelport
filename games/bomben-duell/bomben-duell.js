/**
 * bomben-duell.js
 *
 * Bomberman-artiges Duell auf einem Raster: feste (unzerstörbare) Pfeiler
 * im Schachbrettmuster, dazwischen zufällig verteilte, aber punktsymmetrisch
 * gespiegelte zerstörbare Kisten (damit keine Seite im Vorteil startet).
 * Bewegung läuft kontinuierlich (wie bei Panzer-Duell), die Kollision wird
 * aber pro Achse anhand der 1-4 Rasterzellen geprüft, die das Spielerfeld
 * gerade überlappt - kein tile-gesperrtes Bewegen/Abbiegen nötig.
 *
 * Steuerung: Spieler 1 WASD + Leertaste (Bombe legen), Spieler 2
 * Pfeiltasten + Enter/Strg. Jeder Spieler darf immer nur eine eigene
 * Bombe gleichzeitig auf dem Feld haben. Nach der Zündzeit explodiert eine
 * Bombe kreuzförmig (BLAST_RANGE Felder in jede Richtung), bis sie auf
 * eine feste Wand oder eine zerstörbare Kiste trifft - die Kiste wird
 * dabei zerstört, stoppt die Ausbreitung dahinter aber trotzdem. Steht
 * eine Bombe selbst im Blast einer anderen, zündet sie sofort mit
 * (Kettenreaktion). Der Spieler, der zuerst die Bombe gelegt hat, darf
 * sein eigenes Feld noch verlassen (die Bombe ist für ihn erst wieder
 * solide, sobald er das Feld verlassen hat) - klassisches Bomberman-
 * Verhalten, sonst würde man sich beim Legen sofort selbst einsperren.
 *
 * Schwierigkeit (DIFFICULTY_SETTINGS) beeinflusst Bewegungstempo und
 * Zündzeit für BEIDE Spieler gleichermaßen (kürzere Zündzeit = weniger
 * Reaktionszeit zum Wegrennen), sowie zusätzlich - wie bei den anderen
 * Bot-Gegnern im Portal - Reaktionszeit, Flucht-Zuverlässigkeit
 * (fleeChance) und wie sorgfältig der Bot vor dem Bombenlegen prüft, ob
 * er selbst noch einen Fluchtweg hat (carefulness).
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=duell-wasd-pfeiltasten";
  const WINNING_ROUNDS = 3;
  const ROUND_PAUSE = 1.6; // Sekunden Pause zwischen den Runden

  const HOW_TO_PLAY =
    "Zwei Spieler bewegen sich auf einem Raster mit festen und zerstörbaren Blöcken. Spieler 1 steuert mit WASD und legt mit der Leertaste eine Bombe, Spieler 2 mit den Pfeiltasten und Enter oder Strg. Nach kurzer Zündzeit explodiert eine Bombe kreuzförmig und zerstört Blöcke in Reichweite - trifft die Explosion den Gegner, gewinnt ihr die Runde. Wer zuerst 3 Runden gewinnt, gewinnt das Duell.";

  const MODES = [
    { id: "2p", label: "2 Spieler", icon: "🧑‍🤝‍🧑", description: "Spieler 1 (WASD) gegen Spieler 2 (Pfeiltasten)." },
    { id: "bot", label: "Gegen Bot", icon: "🤖", description: "Spieler 2 wird von einer KI gesteuert." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Werte.
  const DIFFICULTY_SETTINGS = {
    1: { speed: 150, fuseTime: 2.6, reactionTime: 500, fleeChance: 0.5, carefulness: 0.3 },
    2: { speed: 165, fuseTime: 2.3, reactionTime: 380, fleeChance: 0.65, carefulness: 0.5 },
    3: { speed: 180, fuseTime: 2.0, reactionTime: 280, fleeChance: 0.8, carefulness: 0.7 },
    4: { speed: 195, fuseTime: 1.7, reactionTime: 190, fleeChance: 0.92, carefulness: 0.85 },
    5: { speed: 210, fuseTime: 1.4, reactionTime: 110, fleeChance: 1, carefulness: 1 },
  };

  const TILE = 40;
  const COLS = 19;
  const ROWS = 11;
  const WIDTH = COLS * TILE;
  const HEIGHT = ROWS * TILE;
  const PLAYER_SIZE = 30;
  const BLAST_RANGE = 2;
  const EXPLOSION_DURATION = 0.45;
  const BLOCK_DENSITY = 0.55;

  const DIR_VECTORS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const canvas = document.getElementById("bomb-canvas");
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

  function key(col, row) {
    return col + "," + row;
  }

  // ---- Rasterstruktur ----
  //
  // Feste Wand: äußerer Rand ODER (innen) jede Zelle mit gerader Spalte
  // UND gerader Zeile - das klassische Bomberman-Schachbrettmuster aus
  // Pfeilern. Da COLS-1 und ROWS-1 beide gerade sind, ist dieses Muster
  // punktsymmetrisch zur Feldmitte (Spiegelung col->COLS-1-col erhält die
  // Parität), wodurch auch die zufällig verteilten Kisten unten sauber
  // gespiegelt werden können, ohne je Seite unterschiedlich fair zu sein.
  function isBorder(col, row) {
    return col <= 0 || col >= COLS - 1 || row <= 0 || row >= ROWS - 1;
  }

  function isPillar(col, row) {
    return col % 2 === 0 && row % 2 === 0;
  }

  function isWall(col, row) {
    return isBorder(col, row) || isPillar(col, row);
  }

  const P1_SPAWN = { col: 1, row: 1 };
  const P2_SPAWN = { col: COLS - 2, row: ROWS - 2 };
  // "L"-Freiraum um jeden Startpunkt, damit niemand direkt eingemauert startet.
  const SAFE_CELLS = new Set([
    key(P1_SPAWN.col, P1_SPAWN.row),
    key(P1_SPAWN.col + 1, P1_SPAWN.row),
    key(P1_SPAWN.col, P1_SPAWN.row + 1),
    key(P2_SPAWN.col, P2_SPAWN.row),
    key(P2_SPAWN.col - 1, P2_SPAWN.row),
    key(P2_SPAWN.col, P2_SPAWN.row - 1),
  ]);

  function generateDestructibles() {
    const destructibles = new Set();
    const visited = new Set();
    for (let row = 1; row < ROWS - 1; row++) {
      for (let col = 1; col < COLS - 1; col++) {
        const k = key(col, row);
        if (visited.has(k)) continue;
        const mCol = COLS - 1 - col;
        const mRow = ROWS - 1 - row;
        const mk = key(mCol, mRow);
        visited.add(k);
        visited.add(mk);

        if (isWall(col, row) || SAFE_CELLS.has(k)) continue;
        if (Math.random() >= BLOCK_DENSITY) continue;
        destructibles.add(k);
        if (!isWall(mCol, mRow) && !SAFE_CELLS.has(mk)) destructibles.add(mk);
      }
    }
    return destructibles;
  }

  // ---- Geometrie-Hilfsfunktionen ----

  function playerRect(cx, cy) {
    const half = PLAYER_SIZE / 2;
    return { x: cx - half, y: cy - half, w: PLAYER_SIZE, h: PLAYER_SIZE };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function cellsOverlapping(rect) {
    const c0 = Math.floor(rect.x / TILE);
    const c1 = Math.floor((rect.x + rect.w - 0.001) / TILE);
    const r0 = Math.floor(rect.y / TILE);
    const r1 = Math.floor((rect.y + rect.h - 0.001) / TILE);
    const cells = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) cells.push({ col: c, row: r });
    }
    return cells;
  }

  function bombAt(col, row) {
    return state.bombs.find((b) => !b.exploded && b.col === col && b.row === row);
  }

  function isSolidCell(col, row, forPlayerId) {
    if (isWall(col, row)) return true;
    if (state.destructibles.has(key(col, row))) return true;
    const bomb = bombAt(col, row);
    if (bomb && bomb.exemptId !== forPlayerId) return true;
    return false;
  }

  function isPassable(col, row) {
    return !isSolidCell(col, row, null);
  }

  function collidesSolid(rect, forPlayerId) {
    return cellsOverlapping(rect).some(({ col, row }) => isSolidCell(col, row, forPlayerId));
  }

  // ---- Spieler / Spielzustand ----

  function makePlayer(id, spawn) {
    return { id, x: spawn.col * TILE + TILE / 2, y: spawn.row * TILE + TILE / 2, dirs: [] };
  }

  function startRound(s) {
    s.destructibles = generateDestructibles();
    s.p1 = makePlayer("p1", P1_SPAWN);
    s.p2 = makePlayer("p2", P2_SPAWN);
    s.bombs = [];
    s.explosions = [];
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

  function movePlayer(player, dt) {
    const { vx, vy } = velocityFromDirs(player.dirs, state.settings.speed);
    if (vx !== 0) {
      const rect = playerRect(player.x + vx * dt, player.y);
      if (!collidesSolid(rect, player.id)) player.x += vx * dt;
    }
    if (vy !== 0) {
      const rect = playerRect(player.x, player.y + vy * dt);
      if (!collidesSolid(rect, player.id)) player.y += vy * dt;
    }
  }

  function pressDir(player, dir) {
    if (!player.dirs.includes(dir)) player.dirs.push(dir);
  }

  function releaseDir(player, dir) {
    const idx = player.dirs.indexOf(dir);
    if (idx !== -1) player.dirs.splice(idx, 1);
  }

  // ---- Bomben / Explosionen ----

  function placeBomb(player) {
    if (!state || state.finished || state.roundPauseTimer > 0) return;
    if (state.bombs.some((b) => !b.exploded && b.ownerId === player.id)) return; // nur eine eigene Bombe gleichzeitig
    const col = Math.floor(player.x / TILE);
    const row = Math.floor(player.y / TILE);
    if (bombAt(col, row)) return;
    state.bombs.push({
      col,
      row,
      timer: state.settings.fuseTime,
      fuseTime: state.settings.fuseTime,
      ownerId: player.id,
      exemptId: player.id,
      exploded: false,
    });
  }

  // Liefert alle Felder, die eine Explosion an (col,row) treffen würde -
  // kreuzförmig bis BLAST_RANGE, gestoppt von festen Wänden; eine
  // zerstörbare Kiste wird getroffen (und danach zerstört), stoppt die
  // Ausbreitung dahinter aber ebenfalls.
  function computeBlastCells(col, row) {
    const cells = [{ col, row }];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
      for (let i = 1; i <= BLAST_RANGE; i++) {
        const c = col + dc * i;
        const r = row + dr * i;
        if (isWall(c, r)) break;
        cells.push({ col: c, row: r });
        if (state.destructibles.has(key(c, r))) break;
      }
    });
    return cells;
  }

  function triggerExplosion(bomb) {
    if (bomb.exploded) return;
    bomb.exploded = true;
    const cells = computeBlastCells(bomb.col, bomb.row);
    cells.forEach(({ col, row }) => state.destructibles.delete(key(col, row)));
    state.explosions.push({ cells, timer: EXPLOSION_DURATION });

    // Kettenreaktion: andere noch tickende Bomben im Blast sofort mitzünden.
    state.bombs.forEach((other) => {
      if (!other.exploded && cells.some((c) => c.col === other.col && c.row === other.row)) {
        triggerExplosion(other);
      }
    });
  }

  function updateBombs(dt) {
    state.bombs.forEach((bomb) => {
      if (bomb.exploded) return;
      if (bomb.exemptId) {
        const owner = bomb.exemptId === "p1" ? state.p1 : state.p2;
        const ownerCol = Math.floor(owner.x / TILE);
        const ownerRow = Math.floor(owner.y / TILE);
        if (ownerCol !== bomb.col || ownerRow !== bomb.row) bomb.exemptId = null;
      }
      bomb.timer -= dt;
      if (bomb.timer <= 0) triggerExplosion(bomb);
    });
    state.bombs = state.bombs.filter((b) => !b.exploded);
  }

  function updateExplosions(dt) {
    const hit = { p1: false, p2: false };
    const p1Rect = playerRect(state.p1.x, state.p1.y);
    const p2Rect = playerRect(state.p2.x, state.p2.y);
    state.explosions.forEach((ex) => {
      ex.cells.forEach(({ col, row }) => {
        const cellRect = { x: col * TILE, y: row * TILE, w: TILE, h: TILE };
        if (rectsOverlap(cellRect, p1Rect)) hit.p1 = true;
        if (rectsOverlap(cellRect, p2Rect)) hit.p2 = true;
      });
      ex.timer -= dt;
    });
    state.explosions = state.explosions.filter((ex) => ex.timer > 0);
    return hit;
  }

  function resolveRoundEnd(winnerId) {
    state.bombs = [];
    if (!winnerId) {
      state.roundMessage = "💥 Beide getroffen - Unentschieden!";
    } else {
      state.score[winnerId] += 1;
      const winnerLabel =
        state.mode === "bot" ? (winnerId === "p1" ? "Du" : "Der Bot") : winnerId === "p1" ? "Spieler 1" : "Spieler 2";
      state.roundMessage = `💥 ${winnerLabel} gewinnt die Runde!`;
      updateScoreboard();
    }

    if (state.score.p1 >= WINNING_ROUNDS || state.score.p2 >= WINNING_ROUNDS) {
      endGame();
    } else {
      state.roundPauseTimer = ROUND_PAUSE;
    }
  }

  // ---- Bot-KI ----

  function dangerCells() {
    const set = new Set();
    state.bombs.forEach((bomb) => {
      if (bomb.exploded) return;
      computeBlastCells(bomb.col, bomb.row).forEach(({ col, row }) => set.add(key(col, row)));
    });
    state.explosions.forEach((ex) => ex.cells.forEach(({ col, row }) => set.add(key(col, row))));
    return set;
  }

  function neighborDirs(col, row) {
    return Object.keys(DIR_VECTORS).map((dir) => {
      const v = DIR_VECTORS[dir];
      return { dir, col: col + v.dx, row: row + v.dy };
    });
  }

  function decideBotMovement(bot, danger) {
    const col = Math.floor(bot.x / TILE);
    const row = Math.floor(bot.y / TILE);
    const inDanger = danger.has(key(col, row));

    if (inDanger && Math.random() < state.settings.fleeChance) {
      const escape = neighborDirs(col, row).find(
        (n) => isPassable(n.col, n.row) && !danger.has(key(n.col, n.row))
      );
      if (escape) {
        bot.dirs = [escape.dir];
        return;
      }
      const anyOpen = neighborDirs(col, row).find((n) => isPassable(n.col, n.row));
      bot.dirs = anyOpen ? [anyOpen.dir] : [];
      return;
    }

    const target = state.p1;
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const wantVertical = Math.abs(dy) > TILE * 0.4 ? (dy < 0 ? "up" : "down") : null;
    const wantHorizontal = Math.abs(dx) > TILE * 0.4 ? (dx < 0 ? "left" : "right") : null;

    const dirs = [wantVertical, wantHorizontal].filter(Boolean).filter((dir) => {
      const v = DIR_VECTORS[dir];
      return isPassable(col + v.dx, row + v.dy);
    });

    if (dirs.length === 0) {
      const anyOpen = neighborDirs(col, row).find((n) => isPassable(n.col, n.row));
      bot.dirs = anyOpen ? [anyOpen.dir] : [];
    } else {
      bot.dirs = dirs;
    }
  }

  function decideBotBomb(bot, danger) {
    if (state.bombs.some((b) => !b.exploded && b.ownerId === bot.id)) return;

    const col = Math.floor(bot.x / TILE);
    const row = Math.floor(bot.y / TILE);
    if (danger.has(key(col, row))) return; // nicht mitten in Gefahr auch noch selbst eine Bombe legen

    const nearDestructible = neighborDirs(col, row).some((n) => state.destructibles.has(key(n.col, n.row)));
    const sameCol = col === Math.floor(state.p1.x / TILE) && Math.abs(row - Math.floor(state.p1.y / TILE)) <= BLAST_RANGE;
    const sameRow = row === Math.floor(state.p1.y / TILE) && Math.abs(col - Math.floor(state.p1.x / TILE)) <= BLAST_RANGE;
    if (!nearDestructible && !sameCol && !sameRow) return;

    if (Math.random() < state.settings.carefulness) {
      const futureBlast = computeBlastCells(col, row).map(({ col: c, row: r }) => key(c, r));
      const hasEscape = neighborDirs(col, row).some(
        (n) => isPassable(n.col, n.row) && !futureBlast.includes(key(n.col, n.row))
      );
      if (!hasEscape) return;
    }

    placeBomb(bot);
  }

  function updateBotAI(dt) {
    const bot = state.p2;
    state.botThinkTimer -= dt;
    if (state.botThinkTimer > 0) return;
    state.botThinkTimer = state.settings.reactionTime / 1000;

    const danger = dangerCells();
    decideBotMovement(bot, danger);
    decideBotBomb(bot, danger);
  }

  // ---- Update / Render ----

  function update(dt) {
    if (state.roundPauseTimer > 0) {
      state.roundPauseTimer -= dt;
      if (state.roundPauseTimer <= 0) startRound(state);
      return;
    }

    if (state.mode === "bot") updateBotAI(dt);

    movePlayer(state.p1, dt);
    movePlayer(state.p2, dt);

    updateBombs(dt);
    const hit = updateExplosions(dt);

    if (hit.p1 && hit.p2) resolveRoundEnd(null);
    else if (hit.p1) resolveRoundEnd("p2");
    else if (hit.p2) resolveRoundEnd("p1");
  }

  function drawTile(col, row, color) {
    ctx.fillStyle = color;
    ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render() {
    const { colors } = state;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Boden im dezenten Schachbrettmuster.
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        ctx.fillStyle = (col + row) % 2 === 0 ? "#171522" : "#1b1930";
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
      }
    }

    // Feste Pfeiler/Rand.
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!isWall(col, row)) continue;
        drawTile(col, row, "#4b5165");
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(col * TILE + 3, row * TILE + 3, TILE - 6, TILE - 6);
      }
    }

    // Zerstörbare Kisten.
    state.destructibles.forEach((k) => {
      const [col, row] = k.split(",").map(Number);
      drawTile(col, row, "#8a5a2c");
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(col * TILE + 3, row * TILE + 3, TILE - 6, TILE - 6);
    });

    // Bomben (pulsieren, je näher die Zündung rückt).
    state.bombs.forEach((bomb) => {
      const cx = bomb.col * TILE + TILE / 2;
      const cy = bomb.row * TILE + TILE / 2;
      const pulse = 1 + 0.15 * Math.sin((1 - bomb.timer / bomb.fuseTime) * 18);
      ctx.beginPath();
      ctx.arc(cx, cy, (TILE * 0.32) * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "#22212e";
      ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(cx + TILE * 0.18, cy - TILE * 0.28, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Explosionen.
    state.explosions.forEach((ex) => {
      const alpha = Math.max(0, Math.min(1, ex.timer / EXPLOSION_DURATION));
      ex.cells.forEach(({ col, row }) => {
        ctx.globalAlpha = 0.85 * alpha;
        ctx.fillStyle = "#ff7a1a";
        ctx.fillRect(col * TILE + 4, row * TILE + 4, TILE - 8, TILE - 8);
        ctx.globalAlpha = 0.9 * alpha;
        ctx.fillStyle = "#ffe066";
        const inset = TILE * 0.28;
        ctx.fillRect(col * TILE + inset, row * TILE + inset, TILE - inset * 2, TILE - inset * 2);
      });
    });
    ctx.globalAlpha = 1;

    // Spieler.
    [
      { p: state.p1, color: colors.p1 },
      { p: state.p2, color: colors.p2 },
    ].forEach(({ p, color }) => {
      const half = PLAYER_SIZE / 2;
      ctx.fillStyle = color;
      roundRectPath(p.x - half, p.y - half, PLAYER_SIZE, PLAYER_SIZE, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(p.x - 6, p.y - 4, 3, 0, Math.PI * 2);
      ctx.arc(p.x + 6, p.y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    });

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
      gameName: "Bomben-Duell",
      icon: "💣",
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

  const ALL_KEYS = ["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "enter", "control"];

  window.addEventListener("keydown", (event) => {
    const pressedKey = event.key.toLowerCase();
    if (!ALL_KEYS.includes(pressedKey)) return;
    event.preventDefault();
    if (!state || state.finished) return;

    if (pressedKey === "w") pressDir(state.p1, "up");
    else if (pressedKey === "s") pressDir(state.p1, "down");
    else if (pressedKey === "a") pressDir(state.p1, "left");
    else if (pressedKey === "d") pressDir(state.p1, "right");
    else if (pressedKey === " ") placeBomb(state.p1);
    else if (state.mode === "2p") {
      if (pressedKey === "arrowup") pressDir(state.p2, "up");
      else if (pressedKey === "arrowdown") pressDir(state.p2, "down");
      else if (pressedKey === "arrowleft") pressDir(state.p2, "left");
      else if (pressedKey === "arrowright") pressDir(state.p2, "right");
      else if (pressedKey === "enter" || pressedKey === "control") placeBomb(state.p2);
    }
  });

  window.addEventListener("keyup", (event) => {
    const pressedKey = event.key.toLowerCase();
    if (!ALL_KEYS.includes(pressedKey)) return;
    if (!state) return;

    if (pressedKey === "w") releaseDir(state.p1, "up");
    else if (pressedKey === "s") releaseDir(state.p1, "down");
    else if (pressedKey === "a") releaseDir(state.p1, "left");
    else if (pressedKey === "d") releaseDir(state.p1, "right");
    else if (state.mode === "2p") {
      if (pressedKey === "arrowup") releaseDir(state.p2, "up");
      else if (pressedKey === "arrowdown") releaseDir(state.p2, "down");
      else if (pressedKey === "arrowleft") releaseDir(state.p2, "left");
      else if (pressedKey === "arrowright") releaseDir(state.p2, "right");
    }
  });

  showScreen(setupScreen);
  initSetup();
})();
