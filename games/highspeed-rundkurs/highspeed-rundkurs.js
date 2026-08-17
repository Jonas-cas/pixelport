/**
 * highspeed-rundkurs.js
 *
 * Einzelspieler-3D-Rennspiel: ein großer, unregelmäßig geformter
 * Rundkurs (per THREE.CatmullRomCurve3 durch eine Liste von Wegpunkten
 * gelegt) plus zwei kleinere Nebenstrecken anderswo auf der Karte.
 * Physik/Kamera/Drift/Boost/Deko sind 1:1 aus der Referenz-Implementierung
 * übernommen - nur die Baum-/Hindernisdichte hängt (wie gewünscht) vom
 * gewählten Schwierigkeitsgrad ab, die Fahrphysik selbst bleibt für jede
 * Stufe identisch.
 *
 * Steuerung: W/Pfeil-hoch Gas, S/Pfeil-runter Bremsen/Rückwärts, A/D
 * bzw. Pfeil-links/-rechts lenken (winkel-/beschleunigungsbasiert, nicht
 * spurgebunden). Leertaste = Drift (reduzierter Grip, das Auto rutscht
 * seitlich statt sofort der Lenkrichtung zu folgen, mit sichtbaren,
 * verblassenden Reifenspuren). Taste E = Boost: einmaliger ~1-Sekunden-
 * Burst auf bis zu 3-fache Geschwindigkeit (kein Dauerhalten), mit
 * kurzzeitig geweitetem Kamera-Sichtfeld und Auspuffflammen - nach
 * Boost-Ende klingt das Tempo ganz natürlich über die normale Reibung
 * ab, statt hart auf Normaltempo zurückzuspringen.
 *
 * Bäume (3 Arten) stoppen das Auto per Kreis-Kollision; Büsche, Felsen
 * und Blumenbüschel sind rein dekorativ. "Abseits der Strecke" wird nur
 * angezeigt (kein Tempo-Verlust), sobald man von allen drei Strecken
 * herunterfährt. Die Kamera ist eine GTA5-artige Verfolgerkamera direkt
 * hinter dem Auto, die sich mit der Lenkung mitdreht.
 *
 * Da dieses Rennen ein freies Übungs-/Erkundungsfahren ohne Sieg-/
 * Niederlage-Bedingung ist (genau wie in der Referenz), gibt es bewusst
 * keinen Ergebnis-Bildschirm und keinen Modus-Auswahl - nur die
 * Schwierigkeit (Baumdichte) wird vor dem Start gewählt.
 */

import * as THREE from "../../js/vendor/three.module.js";

const CATEGORY_URL = "../../category.html?id=3d";
const TRACK_WIDTH = 17;

const HOW_TO_PLAY =
  "Fahr auf einem großen Rundkurs mit Kurven - W/Pfeil-hoch für Gas, S/Pfeil-runter zum Bremsen/Rückwärtsfahren, A/D bzw. Pfeil-links/-rechts zum Lenken. Halte die Leertaste für einen Drift (das Auto rutscht seitlich), drücke E für einen kurzen Geschwindigkeits-Boost. Bäume stoppen dein Auto, fährst du abseits aller Strecken erscheint nur ein Hinweis (ohne Tempo-Verlust). Der Rundenzähler läuft für die Hauptstrecke - es gibt zwei weitere kleine Strecken zum Erkunden.";

// Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> wie
// viel Anteil der ~550 Deko-Elemente Bäume sind (statt Büsche/Felsen/
// Blumen) und wie viel Abstand zur Strecke ihnen dabei noch zugestanden
// wird - höhere Stufe = mehr Bäume, näher an der Strecke, fordernder
// zum Ausweichen. Die Fahrphysik selbst bleibt unverändert.
const DIFFICULTY_SETTINGS = {
  1: { treeFraction: 0.22, margin: 14 },
  2: { treeFraction: 0.32, margin: 11 },
  3: { treeFraction: 0.45, margin: 8 },
  4: { treeFraction: 0.58, margin: 6 },
  5: { treeFraction: 0.72, margin: 4 },
};

// Wegpunkte für einen geschlossenen Rundkurs (abgerundetes Rechteck mit
// Schikane) plus zwei kleinere Nebenstrecken anderswo auf der Karte.
const WAYPOINTS = [
  [-200, -375], [50, -410], [275, -325], [390, -150],
  [390, 75], [275, 225], [175, 200], [125, 300],
  [275, 390], [50, 425], [-225, 390], [-375, 225],
  [-390, 0], [-375, -200], [-300, -340],
];
const SECONDARY_WAYPOINTS = [
  [650, 50], [850, 120], [900, 300], [820, 480], [650, 520], [520, 400], [520, 180],
];
const TERTIARY_WAYPOINTS = [
  [-650, -450], [-500, -500], [-420, -350], [-480, -180], [-650, -120], [-800, -220], [-830, -380],
];

const setupScreen = document.getElementById("setup-screen");
const playScreen = document.getElementById("play-screen");
const mountEl = document.getElementById("hr-mount");
const lapEl = document.getElementById("hr-lap");
const speedEl = document.getElementById("hr-speed");
const offroadEl = document.getElementById("hr-offroad");
const hintEl = document.getElementById("game-hint");

let state = null;
let raf = null;
let three = null; // Szene/Kamera/Renderer/Strecke, lazy erstellt (siehe ensureScene)

function showScreen(screen) {
  [setupScreen, playScreen].forEach((s) => {
    s.hidden = s !== screen;
  });
}

// ---- Deko-Bausteine ----

function makeCloud() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x555560, emissiveIntensity: 0.15 });
  const puffs = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < puffs; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 2.5, 8, 8), mat);
    s.position.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 5);
    g.add(s);
  }
  return g;
}

function createGrassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#5cb84f";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.strokeStyle = Math.random() < 0.5 ? "#4aa23e" : "#78d066";
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 5, y - 4 - Math.random() * 5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(260, 260);
  return tex;
}

function makeTreeRound() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 2.0, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
  );
  trunk.position.y = 1.0;
  g.add(trunk);
  const leavesColors = [0x2fa354, 0x3ab862, 0x4fc96f, 0x279147];
  for (let i = 0; i < 6; i++) {
    const r = 0.9 + Math.random() * 0.6;
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(r, 9, 9),
      new THREE.MeshStandardMaterial({ color: leavesColors[i % leavesColors.length], roughness: 0.95 })
    );
    leaves.position.set((Math.random() - 0.5) * 1.6, 2.6 + (Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.6);
    g.add(leaves);
  }
  g.userData.collideR = 0.6;
  return g;
}

function makeTreePine() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.38, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 })
  );
  trunk.position.y = 0.8;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const r = 1.5 - i * 0.32;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, 1.5, 9),
      new THREE.MeshStandardMaterial({ color: 0x1f7a45, roughness: 0.9 })
    );
    cone.position.y = 2.0 + i * 0.95;
    g.add(cone);
  }
  g.userData.collideR = 0.55;
  return g;
}

function makeTreeSmall() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.28, 1.1, 7),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
  );
  trunk.position.y = 0.55;
  g.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x4fc96f, roughness: 0.9 })
  );
  leaves.position.y = 1.5;
  g.add(leaves);
  g.userData.collideR = 0.45;
  return g;
}

const TREE_MAKERS = [makeTreeRound, makeTreePine, makeTreeSmall];

function makeRock() {
  const g = new THREE.Group();
  const rockColors = [0x8a8a92, 0x77777f, 0x9a9aa2];
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.35, 0),
    new THREE.MeshStandardMaterial({ color: rockColors[Math.floor(Math.random() * rockColors.length)], roughness: 1 })
  );
  rock.position.y = 0.3;
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  g.add(rock);
  return g;
}

function makeFlowerPatch() {
  const g = new THREE.Group();
  const petalColors = [0xff5f7a, 0xe8a33c, 0xffffff, 0x4fb8ff];
  for (let i = 0; i < 5; i++) {
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshStandardMaterial({ color: petalColors[Math.floor(Math.random() * petalColors.length)] })
    );
    flower.position.set((Math.random() - 0.5) * 1.2, 0.2, (Math.random() - 0.5) * 1.2);
    g.add(flower);
  }
  return g;
}

function makeBush() {
  const g = new THREE.Group();
  const colors = [0x3ab862, 0x2fa354, 0x4fc96f];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.55 + Math.random() * 0.2, 8, 8),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 1 })
    );
    s.position.set((Math.random() - 0.5) * 0.7, 0.4, (Math.random() - 0.5) * 0.7);
    g.add(s);
  }
  return g;
}

function makeCar() {
  const car = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.7, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xe8477a, roughness: 0.3, metalness: 0.3 })
  );
  body.position.y = 0.55;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.6), new THREE.MeshStandardMaterial({ color: 0x1c1a29 }));
  cabin.position.set(0, 1.0, -0.2);
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0e0d17 });
  [[-0.95, 0.42, 1.2], [0.95, 0.42, 1.2], [-0.95, 0.42, -1.2], [0.95, 0.42, -1.2]].forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    car.add(w);
  });
  return car;
}

// Baut die geschlossene Fahrbahn (Box-Segmente entlang der Kurve) und
// gibt die abgetasteten Kurvenpunkte zurück (für Runden-/Abseits-Prüfung).
function buildRoad(roadGroup, roadMat, stripeMat, waypoints, segmentCount) {
  const curvePoints = waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(curvePoints, true, "catmullrom", 0.5);
  const points = curve.getSpacedPoints(segmentCount);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;

    const road = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH, 0.4, segLen + 0.4), roadMat);
    road.position.set(mx, -0.2, mz);
    road.rotation.y = heading;
    roadGroup.add(road);

    if (i % 4 < 2) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, segLen * 0.6), stripeMat);
      stripe.position.set(mx, -0.15, mz);
      stripe.rotation.y = heading;
      roadGroup.add(stripe);
    }
  }
  return points;
}

function farEnoughFromAllRoads(x, z, margin) {
  for (let i = 0; i < three.trackPoints.length; i++) {
    if (Math.hypot(three.trackPoints[i].x - x, three.trackPoints[i].z - z) < margin) return false;
  }
  for (let i = 0; i < three.allExtraRoadPoints.length; i++) {
    if (Math.hypot(three.allExtraRoadPoints[i].x - x, three.allExtraRoadPoints[i].z - z) < margin) return false;
  }
  return true;
}

// ---- Szene (einmalig aufgebaut) / Deko (je Schwierigkeit neu) ----

function ensureScene() {
  if (three) return three;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7ec8f0);
  scene.fog = new THREE.Fog(0x7ec8f0, 130, 950);

  const camera = new THREE.PerspectiveCamera(65, mountEl.clientWidth / mountEl.clientHeight || 1, 0.1, 1600);
  camera.position.set(0, 4, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mountEl.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a6b2f, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.15);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  const cloudGroup = new THREE.Group();
  scene.add(cloudGroup);
  for (let i = 0; i < 26; i++) {
    const cloud = makeCloud();
    const angle = Math.random() * Math.PI * 2;
    const radius = 150 + Math.random() * 700;
    cloud.position.set(Math.cos(angle) * radius, 70 + Math.random() * 60, Math.sin(angle) * radius);
    cloud.scale.setScalar(1 + Math.random() * 2);
    cloudGroup.add(cloud);
  }

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2740, roughness: 0.9 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe8a33c, emissive: 0x552f0a });
  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const trackPoints = buildRoad(roadGroup, roadMat, stripeMat, WAYPOINTS, 500);
  const secondaryPoints = buildRoad(roadGroup, roadMat, stripeMat, SECONDARY_WAYPOINTS, 140);
  const tertiaryPoints = buildRoad(roadGroup, roadMat, stripeMat, TERTIARY_WAYPOINTS, 140);
  const allExtraRoadPoints = secondaryPoints.concat(tertiaryPoints);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(900, 48),
    new THREE.MeshStandardMaterial({ map: createGrassTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.6;
  scene.add(ground);

  const decorGroup = new THREE.Group();
  scene.add(decorGroup);

  const car = makeCar();
  scene.add(car);

  const exhaustGroup = new THREE.Group();
  exhaustGroup.position.set(0, 0.35, -2.0);
  const flame1 = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.9, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9 })
  );
  flame1.rotation.x = -Math.PI / 2;
  flame1.position.z = -0.35;
  exhaustGroup.add(flame1);
  const flame2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.55, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5f2a, transparent: true, opacity: 0.95 })
  );
  flame2.rotation.x = -Math.PI / 2;
  flame2.position.z = -0.55;
  exhaustGroup.add(flame2);
  exhaustGroup.visible = false;
  car.add(exhaustGroup);

  const driftMarksGroup = new THREE.Group();
  scene.add(driftMarksGroup);

  const resizeObserver = new ResizeObserver(() => {
    const width = mountEl.clientWidth;
    const height = mountEl.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(mountEl);

  three = {
    scene, camera, renderer, car, exhaustGroup, flame1, flame2,
    decorGroup, driftMarksGroup,
    trackPoints, allExtraRoadPoints,
    N: trackPoints.length - 1,
  };
  return three;
}

// Verteilt Bäume/Büsche/Felsen/Blumen (insgesamt ~550, wie in der
// Referenz) über die Karte, mit Abstand zu allen drei Strecken. Der
// Baum-Anteil und der Mindestabstand hängen von der Schwierigkeit ab.
function buildDecor(settings) {
  three.decorGroup.clear();
  const treeColliders = [];
  const bushCutoff = settings.treeFraction + (1 - settings.treeFraction) * 0.42;
  const flowerCutoff = bushCutoff + (1 - settings.treeFraction) * 0.31;

  let placed = 0;
  let attempts = 0;
  while (placed < 550 && attempts < 6000) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const radius = 40 + Math.random() * 750;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (!farEnoughFromAllRoads(x, z, TRACK_WIDTH / 2 + settings.margin)) continue;

    const roll = Math.random();
    let item;
    let isTree = false;
    if (roll < settings.treeFraction) {
      item = TREE_MAKERS[Math.floor(Math.random() * TREE_MAKERS.length)]();
      isTree = true;
    } else if (roll < bushCutoff) item = makeBush();
    else if (roll < flowerCutoff) item = makeFlowerPatch();
    else item = makeRock();

    item.position.set(x, 0, z);
    item.rotation.y = Math.random() * Math.PI * 2;
    const scale = 0.8 + Math.random() * 0.6;
    item.scale.setScalar(scale);
    three.decorGroup.add(item);
    if (isTree) treeColliders.push({ x, z, r: (item.userData.collideR || 0.55) * scale });
    placed++;
  }

  three.treeColliders = treeColliders;
}

// ---- Spielsteuerung ----

function startGame(selection) {
  cancelAnimationFrame(raf);

  ensureScene();
  buildDecor(DIFFICULTY_SETTINGS[selection.difficulty.id]);

  // Reifenspuren einer evtl. vorherigen Runde entfernen.
  three.driftMarksGroup.clear();

  const startDir = Math.atan2(
    three.trackPoints[1].x - three.trackPoints[0].x,
    three.trackPoints[1].z - three.trackPoints[0].z
  );

  state = {
    p: { x: three.trackPoints[0].x, z: three.trackPoints[0].z, angle: startDir, vx: 0, vz: 0 },
    keys: {},
    boostFramesLeft: 0,
    driftMarks: [],
    driftSpawnCooldown: 0,
    lastNearestIdx: 0,
    lapCount: 1,
  };

  hintEl.textContent =
    "W/↑ Gas · S/↓ Bremsen/Rückwärts · A D / ←→ lenken · Leertaste = Drift · E = Boost – ein geschlossener Rundkurs, Runden werden gezählt";
  lapEl.textContent = "Runde 1";
  speedEl.textContent = "0 km/h";
  speedEl.classList.remove("is-offroad");
  offroadEl.hidden = true;

  showScreen(playScreen);
  raf = requestAnimationFrame(animate);
}

function spawnDriftMark(x, z) {
  const mark = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 8),
    new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.5 })
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(x, 0.03, z);
  three.driftMarksGroup.add(mark);
  state.driftMarks.push({ mesh: mark, life: 90 });
  if (state.driftMarks.length > 260) {
    const old = state.driftMarks.shift();
    three.driftMarksGroup.remove(old.mesh);
  }
}

function animate() {
  raf = requestAnimationFrame(animate);
  const { camera, renderer, scene, car, exhaustGroup, flame1, flame2 } = three;
  const p = state.p;
  const keys = state.keys;

  const turnLeft = keys.a || keys.arrowleft;
  const turnRight = keys.d || keys.arrowright;
  const accelerate = keys.w || keys.arrowup;
  const brake = keys.s || keys.arrowdown;

  const currentSpeed = Math.hypot(p.vx, p.vz);
  const turnRate = 0.038 * Math.min(1, currentSpeed / 0.4 + 0.3);
  if (turnLeft) p.angle += turnRate;
  if (turnRight) p.angle -= turnRate;

  const accel = 0.032;
  if (accelerate) {
    p.vx += Math.sin(p.angle) * accel;
    p.vz += Math.cos(p.angle) * accel;
  }
  if (brake) {
    p.vx -= Math.sin(p.angle) * accel * 0.8;
    p.vz -= Math.cos(p.angle) * accel * 0.8;
  }
  p.vx *= 0.985;
  p.vz *= 0.985;

  // Taste E = Boost: einmaliger ~1-Sekunden-Burst, kein Dauerhalten.
  const isBoosting = state.boostFramesLeft > 0;
  if (isBoosting) state.boostFramesLeft -= 1;
  const baseFov = 65;
  const targetFov = isBoosting ? 92 : baseFov;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.18);
  camera.updateProjectionMatrix();

  // Leertaste = Drift: weniger "Grip", das Auto rutscht seitlich statt
  // sofort der neuen Fahrtrichtung zu folgen.
  const isDrifting = keys[" "];
  const speedNow = Math.hypot(p.vx, p.vz);
  const grip = isDrifting ? 0.025 : 0.32;
  const targetVx = Math.sin(p.angle) * speedNow;
  const targetVz = Math.cos(p.angle) * speedNow;
  p.vx = THREE.MathUtils.lerp(p.vx, targetVx, grip);
  p.vz = THREE.MathUtils.lerp(p.vz, targetVz, grip);

  // Höchstgeschwindigkeit begrenzen (Sicherheitsobergrenze), aber NICHT
  // sofort nach Boost-Ende runterspringen lassen - das Tempo klingt
  // stattdessen ganz natürlich über die normale Reibung ab.
  const MAX_SPEED = 1.3 * 3;
  const curSpeed = Math.hypot(p.vx, p.vz);
  if (curSpeed > MAX_SPEED) {
    p.vx = (p.vx / curSpeed) * MAX_SPEED;
    p.vz = (p.vz / curSpeed) * MAX_SPEED;
  }
  if (isBoosting) {
    p.vx += Math.sin(p.angle) * 0.06;
    p.vz += Math.cos(p.angle) * 0.06;
  }

  p.x += p.vx;
  p.z += p.vz;

  // Baum-Kollisionen (Kreis-Kollider) stoppen das Auto.
  three.treeColliders.forEach((t) => {
    const dx = p.x - t.x;
    const dz = p.z - t.z;
    const dist = Math.hypot(dx, dz);
    const minDist = t.r + 0.9;
    if (dist < minDist && dist > 0.0001) {
      const nx = dx / dist;
      const nz = dz / dist;
      p.x += nx * (minDist - dist);
      p.z += nz * (minDist - dist);
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) {
        p.vx -= vn * nx;
        p.vz -= vn * nz;
      }
    }
  });

  // Nächster Punkt auf der HAUPTSTRECKE (für die Rundenzählung).
  let nearestIdx = 0;
  let nearestMainDist = Infinity;
  for (let i = 0; i < three.N; i++) {
    const d = Math.hypot(three.trackPoints[i].x - p.x, three.trackPoints[i].z - p.z);
    if (d < nearestMainDist) {
      nearestMainDist = d;
      nearestIdx = i;
    }
  }

  // "Abseits der Strecke" berücksichtigt ALLE drei Strecken.
  let nearestRoadDist = nearestMainDist;
  for (let i = 0; i < three.allExtraRoadPoints.length; i++) {
    const d = Math.hypot(three.allExtraRoadPoints[i].x - p.x, three.allExtraRoadPoints[i].z - p.z);
    if (d < nearestRoadDist) nearestRoadDist = d;
  }
  const isOffRoad = nearestRoadDist > TRACK_WIDTH / 2 + 1.5;
  offroadEl.hidden = !isOffRoad;
  speedEl.classList.toggle("is-offroad", isOffRoad);

  // Rundenzählung: vom Streckenende zurück zum Anfang gewickelt.
  if (state.lastNearestIdx > three.N * 0.85 && nearestIdx < three.N * 0.15) {
    state.lapCount += 1;
    lapEl.textContent = `Runde ${state.lapCount}`;
  }
  state.lastNearestIdx = nearestIdx;

  const speed = Math.hypot(p.vx, p.vz);
  speedEl.textContent = `${Math.round(speed * 800)} km/h`;

  car.position.set(p.x, 0, p.z);
  car.rotation.y = p.angle;

  exhaustGroup.visible = isBoosting;
  if (isBoosting) {
    flame1.scale.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.5, 1 + Math.random() * 0.4);
    flame2.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.6, 1 + Math.random() * 0.5);
  }

  // Reifenspuren hinter den Hinterrädern beim Driften, langsam verblassend.
  if (isDrifting && speedNow > 0.35) {
    state.driftSpawnCooldown -= 1;
    if (state.driftSpawnCooldown <= 0) {
      state.driftSpawnCooldown = 2;
      const rearX = p.x - Math.sin(p.angle) * 1.5;
      const rearZ = p.z - Math.cos(p.angle) * 1.5;
      const rightX = Math.cos(p.angle) * 0.7;
      const rightZ = -Math.sin(p.angle) * 0.7;
      spawnDriftMark(rearX + rightX, rearZ + rightZ);
      spawnDriftMark(rearX - rightX, rearZ - rightZ);
    }
  }
  for (let i = state.driftMarks.length - 1; i >= 0; i--) {
    const dm = state.driftMarks[i];
    dm.life -= 1;
    dm.mesh.material.opacity = Math.max(0, (dm.life / 90) * 0.5);
    if (dm.life <= 0) {
      three.driftMarksGroup.remove(dm.mesh);
      state.driftMarks.splice(i, 1);
    }
  }

  const camDist = 7.5;
  const camHeight = 3.2;
  const behindX = p.x - Math.sin(p.angle) * camDist;
  const behindZ = p.z - Math.cos(p.angle) * camDist;
  camera.position.lerp(new THREE.Vector3(behindX, camHeight, behindZ), 0.12);
  const lookX = p.x + Math.sin(p.angle) * 8;
  const lookZ = p.z + Math.cos(p.angle) * 8;
  camera.lookAt(lookX, 1.2, lookZ);

  renderer.render(scene, camera);
}

function initSetup() {
  PixelPortGameScreens.renderSetup(setupScreen, {
    gameName: "Highspeed-Rundkurs",
    icon: "🏎️",
    intro: "Wähle die Schwierigkeit, um loszufahren.",
    howToPlay: HOW_TO_PLAY,
    defaultDifficultyId: 3,
    backHref: CATEGORY_URL,
    backLabel: "← Zurück zu 3D",
    onStart: startGame,
  });
}

// ---- Eingabe ----

const ALL_KEYS = ["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "e"];

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (!ALL_KEYS.includes(key)) return;
  event.preventDefault();
  if (!state) return;

  if (key === "e" && !state.keys.e) state.boostFramesLeft = 60;
  state.keys[key] = true;
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (!ALL_KEYS.includes(key)) return;
  if (!state) return;
  state.keys[key] = false;
});

showScreen(setupScreen);
initSetup();
