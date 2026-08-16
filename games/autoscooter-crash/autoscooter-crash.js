/**
 * autoscooter-crash.js
 *
 * Autoscooter-Crash: zwei Bumper-Cars auf einer 3D-Strecke mit
 * Rundkurs-Wänden und Abzweigungen (Three.js). Physik/Kamera/Wandlogik
 * sind 1:1 aus der Referenz-Implementierung übernommen, inklusive der
 * beiden dort gefundenen Bugfixes:
 *
 *   - Die Spawn-Punkte beider Autos liegen garantiert in freien Bereichen,
 *     nie exakt auf einer Wandkante (siehe p1/p2 unten).
 *   - resolveWalls() sichert die Distanz vor der Division ab (dist > 0.05),
 *     sonst konnte ein Auto bei einer Distanz nahe Null durch eine
 *     Division-durch-Null quasi ins Nichts katapultiert werden.
 *
 * Steuerung: Spieler 1 WASD, Spieler 2 Pfeiltasten (oder Bot). Wer beim
 * Zusammenstoß die höhere Geschwindigkeit hatte, bekommt einen Punkt.
 * Nach 150 Sekunden gewinnt, wer mehr Punkte hat.
 *
 * Schwierigkeit (DIFFICULTY_SETTINGS) beeinflusst Beschleunigung, Drag
 * (-> Höchstgeschwindigkeit) und die Härte des Rempel-Effekts bei
 * Kollisionen für BEIDE Autos gleichermaßen, sowie zusätzlich - wie bei
 * den anderen Bot-Gegnern im Portal (z.B. Air Hockey) - wie ungenau der
 * Bot lenkt (botError, in Bogenmaß Rauschen auf die Ziel-Steuerrichtung).
 * Zusätzlich wählt die Schwierigkeit auch das Streckenlayout (TRACKS):
 * von "sehr leicht" (offene Bahn, kaum Hindernisse) bis "sehr schwer"
 * (enge Taschen + zusätzliche Pfeiler). Die äußere Begrenzung und damit
 * auch BOT_WAYPOINTS (die bewusst außerhalb aller inneren Abzweigungen
 * verlaufen) bleiben über alle Stufen identisch, nur das Innenleben der
 * Strecke ändert sich - das hält die Bot-Navigation und die Spawn-Punkte
 * für jede Stufe gültig, ohne dass beides je Stufe neu geprüft werden muss.
 */

import * as THREE from "../../js/vendor/three.module.js";

const CATEGORY_URL = "../../category.html?id=3d";
const GAME_DURATION = 150; // Sekunden
const CAR_R = 1.0;

// Äußere Begrenzung - auf allen Schwierigkeitsstufen identisch (siehe
// Kommentar oben zu BOT_WAYPOINTS/Spawn-Punkten).
const OUTER_WALLS = [
  { x: 0, z: -16, w: 44, d: 1, color: 0xf76707 },
  { x: 0, z: 16, w: 44, d: 1, color: 0xf76707 },
  { x: -22, z: 0, w: 1, d: 33, color: 0xf76707 },
  { x: 22, z: 0, w: 1, d: 33, color: 0xf76707 },
];

const ISLAND_COLOR = 0xf5b400; // zentraler Block: kräftiges Gold
const BRANCH_COLOR = 0xd9480f; // Abzweigungs-Querwände: Terracotta
const SIDE_COLOR = 0xa9702c; // Seitenwege-Wände: warmes Braun
const PILLAR_COLOR = 0xe9ecef; // zusätzliche Hindernis-Pfeiler: helles Warngrau

// Streckenlayout je Schwierigkeitsstufe (id aus PixelPortGameScreens.
// DIFFICULTIES) - von offen/einfach bis eng/verwinkelt mit Extra-Pfeilern.
const TRACKS = {
  1: [
    ...OUTER_WALLS,
    { x: 0, z: 0, w: 8, d: 6, color: ISLAND_COLOR },
  ],
  2: [
    ...OUTER_WALLS,
    { x: 0, z: 0, w: 10, d: 8, color: ISLAND_COLOR },
    { x: -17, z: 3, w: 1, d: 14, color: SIDE_COLOR },
    { x: 17, z: -3, w: 1, d: 14, color: SIDE_COLOR },
  ],
  3: [
    ...OUTER_WALLS,
    { x: 0, z: 0, w: 10, d: 8, color: ISLAND_COLOR },
    { x: -10, z: -7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: -10, z: 7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: 10, z: -7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: 10, z: 7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: -17, z: -4, w: 1, d: 8, color: SIDE_COLOR },
    { x: 17, z: -4, w: 1, d: 8, color: SIDE_COLOR },
    { x: -17, z: 8, w: 1, d: 8, color: SIDE_COLOR },
    { x: 17, z: 8, w: 1, d: 8, color: SIDE_COLOR },
  ],
  4: [
    ...OUTER_WALLS,
    { x: 0, z: 0, w: 10, d: 8, color: ISLAND_COLOR },
    { x: -10, z: -7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: -10, z: 7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: 10, z: -7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: 10, z: 7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: -17, z: -4, w: 1, d: 8, color: SIDE_COLOR },
    { x: 17, z: -4, w: 1, d: 8, color: SIDE_COLOR },
    { x: -17, z: 8, w: 1, d: 8, color: SIDE_COLOR },
    { x: 17, z: 8, w: 1, d: 8, color: SIDE_COLOR },
    { x: 13, z: 0, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: -13, z: 0, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: 0, z: 10, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: 0, z: -10, w: 1.4, d: 1.4, color: PILLAR_COLOR },
  ],
  5: [
    ...OUTER_WALLS,
    { x: 0, z: 0, w: 10, d: 8, color: ISLAND_COLOR },
    { x: -10, z: -7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: -10, z: 7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: 10, z: -7, w: 8, d: 1, color: BRANCH_COLOR },
    { x: 10, z: 7, w: 8, d: 1, color: BRANCH_COLOR },
    // engere Seitenwege als Stufe 3/4 (längere Wände -> schmalere Lücke)
    { x: -17, z: -4, w: 1, d: 10, color: SIDE_COLOR },
    { x: 17, z: -4, w: 1, d: 10, color: SIDE_COLOR },
    { x: -17, z: 8, w: 1, d: 10, color: SIDE_COLOR },
    { x: 17, z: 8, w: 1, d: 10, color: SIDE_COLOR },
    { x: 13, z: 0, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: -13, z: 0, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: 0, z: 10, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: 0, z: -10, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: 6, z: -11, w: 1.4, d: 1.4, color: PILLAR_COLOR },
    { x: -6, z: 11, w: 1.4, d: 1.4, color: PILLAR_COLOR },
  ],
};

// Grober äußerer Rundkurs für die Bot-Navigation - bewusst außerhalb aller
// Abzweigungs-Taschen (auf jeder Schwierigkeitsstufe), damit der Bot
// nirgends hängen bleibt.
const BOT_WAYPOINTS = [
  { x: -19, z: -13 }, { x: 0, z: -13 }, { x: 19, z: -13 },
  { x: 19, z: 0 },
  { x: 19, z: 13 }, { x: 0, z: 13 }, { x: -19, z: 13 },
  { x: -19, z: 0 },
];

const HOW_TO_PLAY =
  "Zwei Autoscooter krachen auf einer Strecke mit Rundkurs und Abzweigungen ineinander. Spieler 1 steuert mit WASD (W/S = Gas/Rückwärts, A/D = Lenken), Spieler 2 mit den Pfeiltasten. Bei einem Zusammenstoß bekommt das Auto mit der höheren Geschwindigkeit einen Punkt - rempelt also mit Schwung! Nach 150 Sekunden gewinnt, wer mehr Punkte gesammelt hat.";

const MODES = [
  { id: "2p", label: "2 Spieler", icon: "🧑‍🤝‍🧑", description: "Spieler 1 (WASD) gegen Spieler 2 (Pfeiltasten)." },
  { id: "bot", label: "Gegen Bot", icon: "🤖", description: "Spieler 2 wird von einer KI gesteuert." },
];

// Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Werte.
const DIFFICULTY_SETTINGS = {
  1: { accel: 0.010, drag: 0.955, turnRate: 0.038, bumpForce: 0.12, botError: 0.55 },
  2: { accel: 0.012, drag: 0.960, turnRate: 0.041, bumpForce: 0.15, botError: 0.38 },
  3: { accel: 0.014, drag: 0.965, turnRate: 0.045, bumpForce: 0.18, botError: 0.24 },
  4: { accel: 0.017, drag: 0.970, turnRate: 0.049, bumpForce: 0.23, botError: 0.12 },
  5: { accel: 0.021, drag: 0.976, turnRate: 0.054, bumpForce: 0.30, botError: 0.02 },
};

const setupScreen = document.getElementById("setup-screen");
const playScreen = document.getElementById("play-screen");
const resultScreen = document.getElementById("result-screen");
const mountEl = document.getElementById("ac-mount");
const scoreLeftEl = document.getElementById("ac-score-left");
const scoreRightEl = document.getElementById("ac-score-right");
const timerEl = document.getElementById("ac-timer");
const hintEl = document.getElementById("game-hint");

let state = null;
let lastSelection = null;
let raf = null;
let timerInterval = null;
let three = null; // scene/camera/renderer/cars, lazy erstellt (siehe ensureScene)

function showScreen(screen) {
  [setupScreen, playScreen, resultScreen].forEach((s) => {
    s.hidden = s !== screen;
  });
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    p1: styles.getPropertyValue("--accent").trim() || "#a855f7",
    p2: styles.getPropertyValue("--accent-2").trim() || "#22d3ee",
  };
}

// ---- Three.js-Szene (einmalig aufgebaut, bei jedem Neustart nur Physik/Score zurückgesetzt) ----

function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.6, 2.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
  );
  body.position.y = 0.5;
  g.add(body);
  const bumper = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.15, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2740 })
  );
  bumper.rotation.x = Math.PI / 2;
  bumper.position.y = 0.35;
  g.add(bumper);

  // Kleiner weißer Richtungspfeil oben auf dem Auto, zeigt immer "vorne"
  // (Fahrtrichtung bei angle=0 ist +Z, siehe updateCar) und dreht sich mit
  // der Gruppe mit, da er ein Kind derselben Group ist.
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.7, 3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.85, 0.35);
  g.add(arrow);

  return g;
}

// Kleine Karo-Textur für den Boden (zwei Blautöne), statt einer
// einheitlich flachen Fläche - rein prozedural per Canvas erzeugt, kein
// externes Bild-Asset nötig.
function makeFloorTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3b5bdb";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#4c6ef5";
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(11, 8); // ~4 Einheiten pro Kachel auf dem 44x33-Boden
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Wand-Materialien nach Farbe cachen, damit ein Streckenwechsel nicht bei
// jedem Neustart dieselben Materialien neu anlegt.
const wallMaterialCache = new Map();
function wallMaterial(color) {
  if (!wallMaterialCache.has(color)) {
    wallMaterialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  }
  return wallMaterialCache.get(color);
}

// Baut die Wandkörper für ein Streckenlayout neu auf (bei jedem Spielstart,
// da sich das Layout je Schwierigkeitsgrad unterscheidet - siehe TRACKS).
function buildTrackMeshes(walls) {
  const { wallsGroup } = three;
  wallsGroup.clear();
  walls.forEach((w) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, 1.2, w.d), wallMaterial(w.color));
    mesh.position.set(w.x, 0.6, w.z);
    wallsGroup.add(mesh);
  });
}

function ensureScene() {
  if (three) return three;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0d17);
  scene.fog = new THREE.Fog(0x0e0d17, 40, 90);

  const camera = new THREE.PerspectiveCamera(55, mountEl.clientWidth / mountEl.clientHeight || 1, 0.1, 300);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mountEl.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0x8899ff, 0x221133, 1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(10, 25, 10);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(44, 0.4, 33),
    new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.8 })
  );
  scene.add(floor);

  const wallsGroup = new THREE.Group();
  scene.add(wallsGroup);

  const colors = getThemeColors();
  const car1 = makeCar(new THREE.Color(colors.p1));
  const car2 = makeCar(new THREE.Color(colors.p2));
  scene.add(car1, car2);

  const resizeObserver = new ResizeObserver(() => {
    const width = mountEl.clientWidth;
    const height = mountEl.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(mountEl);

  three = { scene, camera, renderer, car1, car2, wallsGroup };
  return three;
}

// ---- Spielzustand / Physik ----

function makeCarState(x, z, angle) {
  return { x, z, angle, vx: 0, vz: 0 };
}

function resetPositions(s) {
  // Spawn-Punkte doppelt geprüft, dass sie in freien Bereichen liegen und
  // nie exakt auf einer Wandkante - das führte in der Referenzversion
  // sonst dazu, dass ein Auto durch eine Kollisions-Division-durch-Null
  // quasi ins Nichts katapultiert wurde.
  s.p1 = makeCarState(-17, -12, 0);
  s.p2 = makeCarState(17, -12, Math.PI);
  s.botWaypoint = 0;
  s.botTargetAngleError = 0;
}

function resolveWalls(p, walls) {
  walls.forEach((w) => {
    const halfW = w.w / 2;
    const halfD = w.d / 2;
    const closestX = clamp(p.x, w.x - halfW, w.x + halfW);
    const closestZ = clamp(p.z, w.z - halfD, w.z + halfD);
    const dx = p.x - closestX;
    const dz = p.z - closestZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Division durch eine sehr kleine Distanz absichern - genau das konnte
    // vorher ein Auto auf extreme/NaN-Positionen katapultieren.
    if (dist < CAR_R && dist > 0.05) {
      const nx = dx / dist;
      const nz = dz / dist;
      const push = Math.min(CAR_R - dist, 0.5);
      p.x += nx * push;
      p.z += nz * push;
      const vn = p.vx * nx + p.vz * nz;
      p.vx -= vn * nx * 1.6;
      p.vz -= vn * nz * 1.6;
    } else if (dist <= 0.05) {
      p.x += halfW + CAR_R + 0.5;
    }
  });
}

function updateCar(p, turnLeft, turnRight, accelerate, brake, settings, walls) {
  if (turnLeft) p.angle += settings.turnRate;
  if (turnRight) p.angle -= settings.turnRate;
  const accel = settings.accel;
  if (accelerate) {
    p.vx += Math.sin(p.angle) * accel;
    p.vz += Math.cos(p.angle) * accel;
  }
  if (brake) {
    p.vx -= Math.sin(p.angle) * accel * 0.8;
    p.vz -= Math.cos(p.angle) * accel * 0.8;
  }
  p.vx *= settings.drag;
  p.vz *= settings.drag;
  p.x += p.vx;
  p.z += p.vz;
  resolveWalls(p, walls);
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function updateBot(dt, settings) {
  const p = state.p2;
  const target = BOT_WAYPOINTS[state.botWaypoint];
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 4) {
    state.botWaypoint = (state.botWaypoint + 1) % BOT_WAYPOINTS.length;
  }

  // Ziel-Richtung neu "verrauschen", statt jeden Frame - wirkt dadurch wie
  // eine unsichere statt einer perfekt zitternden Lenkung.
  state.botAngleErrorTimer = (state.botAngleErrorTimer || 0) - dt;
  if (state.botAngleErrorTimer <= 0) {
    state.botAngleErrorTimer = 0.4;
    state.botTargetAngleError = (Math.random() * 2 - 1) * settings.botError;
  }

  const desiredAngle = Math.atan2(dx, dz) + state.botTargetAngleError;
  const diff = normalizeAngle(desiredAngle - p.angle);

  const turnLeft = diff > 0.05;
  const turnRight = diff < -0.05;
  updateCar(p, turnLeft, turnRight, true, false, settings, state.walls);
}

function resolveCarCollision() {
  const { p1, p2, settings } = state;
  const dx = p1.x - p2.x;
  const dz = p1.z - p2.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist >= CAR_R * 2 || dist <= 0.0001) return;

  const nx = dx / dist;
  const nz = dz / dist;
  const push = (CAR_R * 2 - dist) / 2;
  p1.x += nx * push;
  p1.z += nz * push;
  p2.x -= nx * push;
  p2.z -= nz * push;

  const speed1 = Math.hypot(p1.vx, p1.vz);
  const speed2 = Math.hypot(p2.vx, p2.vz);
  if (speed1 > speed2 + 0.02) {
    state.score.p1 += 1;
    updateScoreboard();
  } else if (speed2 > speed1 + 0.02) {
    state.score.p2 += 1;
    updateScoreboard();
  }

  p1.vx += nx * settings.bumpForce;
  p1.vz += nz * settings.bumpForce;
  p2.vx -= nx * settings.bumpForce;
  p2.vz -= nz * settings.bumpForce;
}

function updateScoreboard() {
  scoreLeftEl.textContent = String(state.score.p1);
  scoreRightEl.textContent = String(state.score.p2);
}

function update(dt) {
  const { settings, walls } = state;
  updateCar(state.p1, state.keys.a, state.keys.d, state.keys.w, state.keys.s, settings, walls);

  if (state.mode === "bot") {
    updateBot(dt, settings);
  } else {
    updateCar(state.p2, state.keys.ArrowLeft, state.keys.ArrowRight, state.keys.ArrowUp, state.keys.ArrowDown, settings, walls);
  }

  resolveCarCollision();
}

// ---- Rendering ----

function render() {
  const { camera, renderer, scene, car1, car2 } = three;
  const { p1, p2 } = state;

  car1.position.set(p1.x, 0, p1.z);
  car1.rotation.y = p1.angle;
  car2.position.set(p2.x, 0, p2.z);
  car2.rotation.y = p2.angle;

  // Kamera folgt der Mitte zwischen beiden Autos, zoomt weiter raus, je
  // weiter sie auseinander sind.
  const midX = (p1.x + p2.x) / 2;
  const midZ = (p1.z + p2.z) / 2;
  const spread = Math.hypot(p1.x - p2.x, p1.z - p2.z);
  const camHeight = clamp(14 + spread * 0.5, 16, 32);
  camera.position.lerp(new THREE.Vector3(midX, camHeight, midZ + camHeight * 0.6), 0.06);
  camera.lookAt(midX, 0, midZ);

  renderer.render(scene, camera);
}

let lastTime = 0;

function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!state.finished) update(dt);
  render();
}

// ---- Spielsteuerung ----

function startGame(selection) {
  lastSelection = selection;
  clearInterval(timerInterval);
  cancelAnimationFrame(raf);

  showScreen(playScreen);
  ensureScene();
  buildTrackMeshes(TRACKS[selection.difficulty.id]);

  state = {
    settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
    walls: TRACKS[selection.difficulty.id],
    mode: selection.mode.id,
    score: { p1: 0, p2: 0 },
    timeLeft: GAME_DURATION,
    finished: false,
    keys: {},
  };
  resetPositions(state);
  updateScoreboard();
  timerEl.textContent = `⏱ ${state.timeLeft}s`;
  hintEl.textContent =
    state.mode === "bot" ? "Du: WASD   ·   Gegner: Bot" : "Spieler 1: WASD   ·   Spieler 2: Pfeiltasten";

  timerInterval = setInterval(() => {
    if (state.finished) return;
    state.timeLeft -= 1;
    timerEl.textContent = `⏱ ${state.timeLeft}s`;
    if (state.timeLeft <= 0) endGame();
  }, 1000);

  lastTime = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function endGame() {
  state.finished = true;
  clearInterval(timerInterval);

  const { p1, p2 } = state.score;
  const winnerIsP1 = p1 > p2;
  const winnerIsP2 = p2 > p1;
  const winnerLabel = state.mode === "bot" ? "Du" : "Spieler 1";
  const loserLabel = state.mode === "bot" ? "Der Bot" : "Spieler 2";

  const title = !winnerIsP1 && !winnerIsP2
    ? "🤝 Unentschieden!"
    : winnerIsP1
      ? `🏆 ${winnerLabel} gewinnt!`
      : `🏆 ${loserLabel} gewinnt!`;

  PixelPortGameScreens.renderResult(resultScreen, {
    title,
    message: `Endstand: ${p1} : ${p2}`,
    backHref: CATEGORY_URL,
    onRestart: () => startGame(lastSelection),
  });
  showScreen(resultScreen);
}

function initSetup() {
  PixelPortGameScreens.renderSetup(setupScreen, {
    gameName: "Autoscooter-Crash",
    icon: "🚗",
    intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
    howToPlay: HOW_TO_PLAY,
    modes: MODES,
    defaultDifficultyId: 3,
    defaultModeId: "2p",
    backHref: CATEGORY_URL,
    backLabel: "← Zurück zu 3D",
    onStart: startGame,
  });
}

// ---- Eingabe ----

const CONTROL_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
const KEY_NAMES = { w: "w", a: "a", s: "s", d: "d", arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight" };

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (!CONTROL_KEYS.includes(key)) return;
  event.preventDefault();
  if (!state || state.finished) return;
  state.keys[KEY_NAMES[key]] = true;
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (!CONTROL_KEYS.includes(key)) return;
  if (!state) return;
  state.keys[KEY_NAMES[key]] = false;
});

showScreen(setupScreen);
initSetup();
