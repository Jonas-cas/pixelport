/**
 * uno.js
 *
 * Spiellogik für Uno mit dem klassischen 108-Karten-Deck (4 Farben je
 * 0-9 (die 0 einmal, 1-9 doppelt), Aussetzen/Richtungswechsel/+2 je
 * zweimal pro Farbe, dazu 4x Farbwahl und 4x Farbwahl +4).
 *
 * Umgesetzte Sonderregeln:
 *   Aussetzen     -> nächster Spieler wird übersprungen
 *   Richtungswechsel -> Spielrichtung dreht sich um (bei genau 2 Spielern
 *                        wirkt das wie ein Aussetzen, da die Runde sonst
 *                        wieder beim selben Spieler landen würde)
 *   +2 / Farbwahl +4 -> der nächste Spieler zieht sofort die Karten und
 *                        setzt aus (offizielle Regeln: kein Stapeln)
 *   Farbwahl(+4)  -> Spieler wünscht sich eine neue Farbe
 * Vereinfachungen gegenüber Turnierregeln (bewusst, für eine flüssige
 * digitale Runde, analog zu Mau Mau): kein "Uno!"-Rufen, die Startkarte
 * hat keinen Sondereffekt, Farbwahl +4 ist immer legal (keine Prüfung,
 * ob der Spieler auch die aktuelle Farbe hätte legen können), beim
 * Ziehen ohne passende Karte wird genau eine Karte gezogen und der Zug
 * endet direkt.
 *
 * Schwierigkeit wirkt sich auf die "Cleverness" der Bots aus: wie oft sie
 * die heuristisch beste statt einer zufälligen gültigen Karte spielen -
 * insbesondere wie gezielt sie Aussetzen/+2/Farbwahl+4 gegen Spieler mit
 * wenigen Handkarten einsetzen.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=kartenspiele";
  const BOT_DELAY = 650; // ms "Bedenkzeit" pro Bot-Zug, rein kosmetisch

  const HOW_TO_PLAY =
    "Reihum legt ihr eine Karte, die in Farbe oder Zahl/Symbol zur obersten Karte passt. Aussetzen überspringt den nächsten Spieler, Richtungswechsel dreht die Reihenfolge um, und +2 zwingt den nächsten Spieler, 2 Karten zu ziehen und auszusetzen. Die Farbwahl-Karten sind immer legal und lassen dich eine neue Farbe bestimmen - die schwarze +4-Karte zwingt den nächsten Spieler zusätzlich, 4 Karten zu ziehen. Kannst du keine passende Karte legen, musst du eine Karte ziehen. Wer zuerst alle Karten losgeworden ist, gewinnt.";

  const MODES = [
    { id: "1bot", label: "1 Bot", description: "Du spielst gegen einen Bot." },
    { id: "2bots", label: "2 Bots", description: "Du spielst gegen zwei Bots." },
    { id: "3bots", label: "3 Bots", description: "Du spielst gegen drei Bots." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Bot-Cleverness (0..1).
  const DIFFICULTY_SETTINGS = {
    1: { smartness: 0 },
    2: { smartness: 0.25 },
    3: { smartness: 0.5 },
    4: { smartness: 0.75 },
    5: { smartness: 1 },
  };

  const COLORS = ["red", "yellow", "green", "blue"];
  const COLOR_NAMES = { red: "Rot", yellow: "Gelb", green: "Grün", blue: "Blau" };
  const TYPE_LABEL = { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "★", wild4: "+4" };
  const HAND_SIZE = 7;

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");

  const opponentsEl = document.getElementById("uno-opponents");
  const drawPileEl = document.getElementById("uno-draw-pile");
  const drawCountEl = document.getElementById("uno-draw-count");
  const discardCardEl = document.getElementById("uno-discard-card");
  const colorBadgeEl = document.getElementById("uno-color-badge");
  const statusEl = document.getElementById("uno-status");
  const colorPickerEl = document.getElementById("uno-color-picker");
  const handEl = document.getElementById("uno-hand");

  let gameState = null;
  let lastSelection = null;
  let botTimeout = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  // ---- Deck / Utilities ----

  function createDeck() {
    const deck = [];
    let n = 0;
    COLORS.forEach((color) => {
      deck.push({ color, type: "number", value: 0, id: `c${n++}` });
      for (let v = 1; v <= 9; v++) {
        deck.push({ color, type: "number", value: v, id: `c${n++}` });
        deck.push({ color, type: "number", value: v, id: `c${n++}` });
      }
      for (let k = 0; k < 2; k++) {
        deck.push({ color, type: "skip", id: `c${n++}` });
        deck.push({ color, type: "reverse", id: `c${n++}` });
        deck.push({ color, type: "draw2", id: `c${n++}` });
      }
    });
    for (let k = 0; k < 4; k++) {
      deck.push({ color: "wild", type: "wild", id: `c${n++}` });
      deck.push({ color: "wild", type: "wild4", id: `c${n++}` });
    }
    return deck;
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function cardLabel(card) {
    return card.type === "number" ? String(card.value) : TYPE_LABEL[card.type];
  }

  // ---- Spielzustand ----

  function createState(settings, modeId) {
    const botCount = { "1bot": 1, "2bots": 2, "3bots": 3 }[modeId];
    const players = [{ id: 0, name: "Du", isHuman: true, hand: [] }];
    for (let i = 1; i <= botCount; i++) {
      players.push({ id: i, name: `Bot ${i}`, isHuman: false, hand: [] });
    }

    const deck = shuffle(createDeck());
    players.forEach((p) => {
      for (let i = 0; i < HAND_SIZE; i++) p.hand.push(deck.pop());
    });

    // Startkarte: keine Farbwahl-Karte, damit die erste Runde ohne
    // Sondereffekt beginnt (bewusste Vereinfachung, siehe Dateikopf).
    let startIdx = deck.length - 1;
    while (deck[startIdx].color === "wild") startIdx--;
    const startCard = deck.splice(startIdx, 1)[0];

    return {
      settings,
      players,
      currentPlayerIndex: 0,
      direction: 1,
      drawPile: deck,
      discardPile: [startCard],
      activeColor: startCard.color,
      awaitingColorWish: false,
      pendingWishCard: null,
      finished: false,
      winnerIndex: null,
    };
  }

  function topCard(state) {
    return state.discardPile[state.discardPile.length - 1];
  }

  function isValidPlay(card, state) {
    if (card.color === "wild") return true;
    if (card.color === state.activeColor) return true;
    const top = topCard(state);
    if (card.type === "number" && top.type === "number" && card.value === top.value) return true;
    if (card.type !== "number" && card.type === top.type) return true;
    return false;
  }

  function getValidPlays(hand, state) {
    return hand.filter((card) => isValidPlay(card, state));
  }

  function stepIndex(state, from, steps) {
    const n = state.players.length;
    return (((from + steps * state.direction) % n) + n) % n;
  }

  function advanceTurn(state, steps) {
    state.currentPlayerIndex = stepIndex(state, state.currentPlayerIndex, steps);
  }

  function reshuffleIfNeeded(state) {
    if (state.drawPile.length > 0) return;
    if (state.discardPile.length <= 1) return; // nichts zum Mischen da
    const top = state.discardPile.pop();
    state.drawPile = shuffle(state.discardPile);
    state.discardPile = [top];
  }

  function drawCards(state, playerIndex, count) {
    const player = state.players[playerIndex];
    for (let i = 0; i < count; i++) {
      reshuffleIfNeeded(state);
      if (state.drawPile.length === 0) break; // beide Stapel leer (Randfall) - abbrechen
      player.hand.push(state.drawPile.pop());
    }
  }

  /**
   * Spielt card für playerIndex aus: entfernt sie aus der Hand, legt sie auf
   * den Ablagestapel und wendet ihren Effekt an. chosenColor ist bei einer
   * Farbwahl-Karte (wild/wild4) Pflicht, sonst wird sie ignoriert.
   */
  function playCard(state, playerIndex, card, chosenColor) {
    const player = state.players[playerIndex];
    const idx = player.hand.findIndex((c) => c.id === card.id);
    player.hand.splice(idx, 1);
    state.discardPile.push(card);

    if (player.hand.length === 0) {
      state.finished = true;
      state.winnerIndex = playerIndex;
      return;
    }

    state.activeColor = card.color === "wild" ? chosenColor : card.color;

    if (card.type === "skip") {
      advanceTurn(state, 2);
    } else if (card.type === "reverse") {
      if (state.players.length === 2) {
        advanceTurn(state, 2); // wirkt wie Aussetzen
      } else {
        state.direction *= -1;
        advanceTurn(state, 1);
      }
    } else if (card.type === "draw2") {
      const targetIdx = stepIndex(state, state.currentPlayerIndex, 1);
      drawCards(state, targetIdx, 2);
      advanceTurn(state, 2);
    } else if (card.type === "wild4") {
      const targetIdx = stepIndex(state, state.currentPlayerIndex, 1);
      drawCards(state, targetIdx, 4);
      advanceTurn(state, 2);
    } else {
      advanceTurn(state, 1);
    }
  }

  // ---- Bot-KI ----

  function chooseBotCard(bot, validPlays, state, smartness) {
    if (Math.random() > smartness) {
      return validPlays[Math.floor(Math.random() * validPlays.length)];
    }

    const targetIdx = stepIndex(state, state.currentPlayerIndex, 1);
    const targetPlayer = state.players[targetIdx];
    const colorCounts = {};
    bot.hand.forEach((c) => {
      if (c.color !== "wild") colorCounts[c.color] = (colorCounts[c.color] || 0) + 1;
    });

    let best = validPlays[0];
    let bestScore = -Infinity;
    for (const card of validPlays) {
      let score = (colorCounts[card.color] || 0) * 0.5;
      if (card.type === "skip") {
        score += targetPlayer.hand.length <= 2 ? 9 : 4;
      } else if (card.type === "draw2") {
        score += targetPlayer.hand.length <= 2 ? 9 : 4;
      } else if (card.type === "wild4") {
        score += targetPlayer.hand.length <= 2 ? 10 : 3;
      } else if (card.type === "reverse") {
        score += 2;
      } else if (card.type === "wild") {
        score += 1.5;
      }
      score += Math.random() * 0.3; // etwas Rauschen gegen komplett deterministisches Spiel
      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }
    return best;
  }

  function chooseBotWishColor(remainingHand) {
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    remainingHand.forEach((c) => {
      if (c.color !== "wild") counts[c.color] += 1;
    });
    let best = COLORS[0];
    let bestCount = -1;
    COLORS.forEach((color) => {
      if (counts[color] > bestCount) {
        bestCount = counts[color];
        best = color;
      }
    });
    return best;
  }

  function runBotTurn() {
    const state = gameState;
    const idx = state.currentPlayerIndex;
    const bot = state.players[idx];
    const smartness = state.settings.smartness;

    const valid = getValidPlays(bot.hand, state);
    if (valid.length > 0) {
      const chosen = chooseBotCard(bot, valid, state, smartness);
      if (chosen.color === "wild") {
        const remaining = bot.hand.filter((c) => c.id !== chosen.id);
        playCard(state, idx, chosen, chooseBotWishColor(remaining));
      } else {
        playCard(state, idx, chosen, null);
      }
    } else {
      drawCards(state, idx, 1);
      advanceTurn(state, 1);
    }

    afterStateChange();
  }

  function afterStateChange() {
    render();
    if (gameState.finished) {
      endGame();
      return;
    }
    const current = gameState.players[gameState.currentPlayerIndex];
    if (!current.isHuman) {
      botTimeout = setTimeout(runBotTurn, BOT_DELAY);
    }
  }

  // ---- Mensch-Interaktion ----

  function handleHumanPlayCard(cardId) {
    const state = gameState;
    if (!state || state.finished || state.awaitingColorWish) return;
    if (state.players[state.currentPlayerIndex].id !== 0) return;

    const human = state.players[0];
    const card = human.hand.find((c) => c.id === cardId);
    if (!card || !isValidPlay(card, state)) return;

    if (card.color === "wild") {
      state.awaitingColorWish = true;
      state.pendingWishCard = card;
      render();
      return;
    }

    playCard(state, 0, card, null);
    afterStateChange();
  }

  function handleHumanWishColor(color) {
    const state = gameState;
    if (!state || !state.awaitingColorWish) return;
    const card = state.pendingWishCard;
    state.awaitingColorWish = false;
    state.pendingWishCard = null;
    playCard(state, 0, card, color);
    afterStateChange();
  }

  function handleHumanDraw() {
    const state = gameState;
    if (!state || state.finished || state.awaitingColorWish) return;
    if (state.players[state.currentPlayerIndex].id !== 0) return;

    const human = state.players[0];
    if (getValidPlays(human.hand, state).length > 0) return; // muss spielen, wenn möglich

    drawCards(state, 0, 1);
    advanceTurn(state, 1);
    afterStateChange();
  }

  // ---- Rendering ----

  /**
   * Baut das Aussehen einer echten Uno-Karte: farbiges Kartenfeld, weiße
   * Ellipse in der Mitte mit dem Symbol/der Zahl, zusätzlich kleine
   * Eckwerte oben links und unten rechts (gespiegelt) für Erkennbarkeit
   * auch bei überlappenden Karten in der Hand.
   */
  function renderCardFace(el, card) {
    el.className = "uno-card " + (card.color === "wild" ? "uno-card--wild" : "uno-card--color");
    el.textContent = "";
    if (card.color === "wild") {
      el.style.removeProperty("--uno-card-color");
    } else {
      el.style.setProperty("--uno-card-color", `var(--uno-${card.color})`);
    }

    function corner(extraClass) {
      const c = document.createElement("span");
      c.className = "uno-card__corner" + (extraClass ? " " + extraClass : "");
      c.textContent = cardLabel(card);
      return c;
    }

    const oval = document.createElement("span");
    oval.className = "uno-card__oval";
    const label = document.createElement("span");
    label.className = "uno-card__label";
    label.textContent = cardLabel(card);
    oval.appendChild(label);

    el.append(corner(), oval, corner("uno-card__corner--bottom"));
  }

  function render() {
    const state = gameState;
    const human = state.players[0];
    const isHumanTurn = state.players[state.currentPlayerIndex].id === 0;

    // Gegner
    opponentsEl.innerHTML = "";
    state.players.slice(1).forEach((bot, i) => {
      const pill = document.createElement("div");
      pill.className = "uno-opponent" + (state.currentPlayerIndex === i + 1 ? " is-active" : "");
      const name = document.createElement("span");
      name.className = "uno-opponent-name";
      name.textContent = "🤖 " + bot.name;
      const count = document.createElement("span");
      count.className = "uno-opponent-count";
      count.textContent = `${bot.hand.length} Karte${bot.hand.length === 1 ? "" : "n"}`;
      pill.append(name, count);
      opponentsEl.appendChild(pill);
    });

    // Stapel
    drawCountEl.textContent = `${state.drawPile.length} Karten`;
    renderCardFace(discardCardEl, topCard(state));

    const wishActive = state.activeColor !== topCard(state).color;
    colorBadgeEl.hidden = !wishActive;
    if (wishActive) {
      colorBadgeEl.textContent = COLOR_NAMES[state.activeColor];
      colorBadgeEl.style.setProperty("--uno-card-color", `var(--uno-${state.activeColor})`);
    }

    const humanValidPlays = getValidPlays(human.hand, state);
    const drawIsActive = isHumanTurn && !state.awaitingColorWish && humanValidPlays.length === 0;
    drawPileEl.classList.toggle("is-active", drawIsActive);
    drawPileEl.onclick = drawIsActive ? handleHumanDraw : null;

    // Status
    if (state.awaitingColorWish) {
      statusEl.textContent = "Wähle eine neue Farbe.";
    } else if (!isHumanTurn) {
      statusEl.textContent = `${state.players[state.currentPlayerIndex].name} ist am Zug ...`;
    } else if (humanValidPlays.length === 0) {
      statusEl.textContent = "Keine passende Karte - ziehe eine Karte.";
    } else {
      statusEl.textContent = "Du bist dran - spiele eine passende Karte.";
    }

    // Farbwahl-Auswahl
    colorPickerEl.hidden = !state.awaitingColorWish;
    colorPickerEl.innerHTML = "";
    if (state.awaitingColorWish) {
      COLORS.forEach((color) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "uno-color-button";
        btn.style.setProperty("--uno-card-color", `var(--uno-${color})`);
        btn.title = COLOR_NAMES[color];
        btn.addEventListener("click", () => handleHumanWishColor(color));
        colorPickerEl.appendChild(btn);
      });
    }

    // Hand
    handEl.innerHTML = "";
    human.hand.forEach((card) => {
      const el = document.createElement("div");
      renderCardFace(el, card);

      const canClickCards = isHumanTurn && !state.awaitingColorWish;
      const isPlayable = canClickCards && isValidPlay(card, state);
      el.classList.toggle("is-playable", isPlayable);
      if (isPlayable) {
        el.addEventListener("click", () => handleHumanPlayCard(card.id));
      }
      handEl.appendChild(el);
    });
  }

  // ---- Spielsteuerung ----

  function startGame(selection) {
    lastSelection = selection;
    clearTimeout(botTimeout);

    const settings = DIFFICULTY_SETTINGS[selection.difficulty.id];
    gameState = createState(settings, selection.mode.id);

    showScreen(playScreen);
    afterStateChange();
  }

  function endGame() {
    const winner = gameState.players[gameState.winnerIndex];
    const title = winner.id === 0 ? "🏆 Du gewinnst!" : `🏆 ${winner.name} gewinnt!`;
    const others = gameState.players
      .filter((p) => p.id !== gameState.winnerIndex)
      .map((p) => `${p.name}: ${p.hand.length}`)
      .join(" · ");

    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message: `Restkarten – ${others}`,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Uno",
      icon: "🔴🟡",
      intro: "Wähle Schwierigkeit und Anzahl der Bots, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "1bot",
      onStart: startGame,
    });
  }

  showScreen(setupScreen);
  initSetup();
})();
