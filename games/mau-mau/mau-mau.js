/**
 * mau-mau.js
 *
 * Spiellogik für Mau Mau nach gängigen deutschen Standardregeln, gespielt
 * mit dem 32-Karten-Skatblatt (7 bis Ass).
 *
 * Umgesetzte Sonderregeln:
 *   7   -> nächster Spieler zieht 2 Karten (mehrere 7en stapeln sich addiert)
 *   8   -> nächster Spieler setzt aus
 *   Bube -> immer spielbar, Spieler wünscht eine neue Farbe
 * Vereinfachungen gegenüber Turnier-/Hausregeln (bewusst, für eine flüssige
 * digitale Runde): kein "Mau"-Rufen, beim Ziehen ohne passende Karte wird
 * genau eine Karte gezogen und der Zug endet direkt (keine Zieh-Kette bis
 * eine passende Karte kommt).
 *
 * Schwierigkeit wirkt sich auf die "Cleverness" der Bots aus: wie oft sie
 * die heuristisch beste statt einer zufälligen gültigen Karte spielen, wie
 * zuverlässig sie eine 7 zum Kontern einsetzen, und wie sinnvoll sie beim
 * Bubenspiel eine Farbe wünschen.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=kartenspiele";
  const BOT_DELAY = 650; // ms "Bedenkzeit" pro Bot-Zug, rein kosmetisch

  const HOW_TO_PLAY =
    "Reihum legt ihr eine Karte, die zur Farbe oder zum Wert der obersten Karte passt. Eine 7 zwingt den nächsten Spieler, 2 Karten zu ziehen (mehrere 7en hintereinander addieren sich), eine 8 lässt den nächsten Spieler aussetzen, und ein Bube erlaubt es, eine neue Farbe zu wünschen. Kannst du keine passende Karte legen, musst du eine Karte ziehen. Wer zuerst alle Karten losgeworden ist, gewinnt.";

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

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RED_SUITS = ["♥", "♦"];
  const RANKS = ["7", "8", "9", "10", "B", "D", "K", "A"];
  const HAND_SIZE = 5;

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");

  const opponentsEl = document.getElementById("mm-opponents");
  const drawPileEl = document.getElementById("mm-draw-pile");
  const drawCountEl = document.getElementById("mm-draw-count");
  const discardCardEl = document.getElementById("mm-discard-card");
  const wishBadgeEl = document.getElementById("mm-wish-badge");
  const statusEl = document.getElementById("mm-status");
  const suitPickerEl = document.getElementById("mm-suit-picker");
  const handEl = document.getElementById("mm-hand");

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
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, id: `${rank}${suit}` });
      }
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

  function isRed(suit) {
    return RED_SUITS.includes(suit);
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

    const discardPile = [deck.pop()];

    return {
      settings,
      players,
      currentPlayerIndex: 0,
      drawPile: deck,
      discardPile,
      activeSuit: discardPile[0].suit,
      pendingDraw: 0,
      awaitingSuitWish: false,
      pendingWishCard: null,
      finished: false,
      winnerIndex: null,
    };
  }

  function topCard(state) {
    return state.discardPile[state.discardPile.length - 1];
  }

  function isValidPlay(card, state) {
    if (card.rank === "B") return true;
    return card.suit === state.activeSuit || card.rank === topCard(state).rank;
  }

  function getValidPlays(hand, state) {
    return hand.filter((card) => isValidPlay(card, state));
  }

  function advanceTurn(state, step) {
    const n = state.players.length;
    state.currentPlayerIndex = (state.currentPlayerIndex + step) % n;
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
   * den Ablagestapel und wendet ihren Effekt an (Farbe setzen, 7/8/Bube).
   * chosenWishSuit ist bei einem Buben Pflicht (sonst wird sie ignoriert).
   */
  function playCard(state, playerIndex, card, chosenWishSuit) {
    const player = state.players[playerIndex];
    const idx = player.hand.findIndex((c) => c.id === card.id);
    player.hand.splice(idx, 1);
    state.discardPile.push(card);

    if (player.hand.length === 0) {
      state.finished = true;
      state.winnerIndex = playerIndex;
      return;
    }

    if (card.rank === "B") {
      state.activeSuit = chosenWishSuit;
      advanceTurn(state, 1);
      return;
    }

    state.activeSuit = card.suit;
    if (card.rank === "7") {
      state.pendingDraw += 2;
      advanceTurn(state, 1);
    } else if (card.rank === "8") {
      advanceTurn(state, 2); // nächster Spieler setzt aus
    } else {
      advanceTurn(state, 1);
    }
  }

  // ---- Bot-KI ----

  function chooseBotCard(bot, validPlays, state, smartness) {
    if (Math.random() > smartness) {
      return validPlays[Math.floor(Math.random() * validPlays.length)];
    }

    const nextIdx = (state.currentPlayerIndex + 1) % state.players.length;
    const nextPlayer = state.players[nextIdx];
    const suitCounts = {};
    bot.hand.forEach((c) => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    let best = validPlays[0];
    let bestScore = -Infinity;
    for (const card of validPlays) {
      let score = (suitCounts[card.suit] || 0) * 0.5;
      if (card.rank === "7") {
        score += nextPlayer.hand.length <= 2 ? 9 : 4;
      } else if (card.rank === "8") {
        score += nextPlayer.hand.length <= 2 ? 7 : 2;
      } else if (card.rank === "B") {
        score += 2.5;
      }
      score += Math.random() * 0.3; // etwas Rauschen gegen komplett deterministisches Spiel
      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }
    return best;
  }

  function chooseBotWishSuit(remainingHand) {
    const counts = { "♠": 0, "♥": 0, "♦": 0, "♣": 0 };
    remainingHand.forEach((c) => {
      counts[c.suit] += 1;
    });
    let best = SUITS[0];
    let bestCount = -1;
    SUITS.forEach((suit) => {
      if (counts[suit] > bestCount) {
        bestCount = counts[suit];
        best = suit;
      }
    });
    return best;
  }

  function chooseBotCounterSeven(bot, smartness) {
    const sevens = bot.hand.filter((c) => c.rank === "7");
    if (sevens.length === 0) return null;
    const chance = 0.2 + 0.8 * smartness;
    if (Math.random() > chance) return null;
    return sevens[0];
  }

  function runBotTurn() {
    const state = gameState;
    const idx = state.currentPlayerIndex;
    const bot = state.players[idx];
    const smartness = state.settings.smartness;

    if (state.pendingDraw > 0) {
      const seven = chooseBotCounterSeven(bot, smartness);
      if (seven) {
        playCard(state, idx, seven, null);
      } else {
        drawCards(state, idx, state.pendingDraw);
        state.pendingDraw = 0;
        advanceTurn(state, 1);
      }
    } else {
      const valid = getValidPlays(bot.hand, state);
      if (valid.length > 0) {
        const chosen = chooseBotCard(bot, valid, state, smartness);
        if (chosen.rank === "B") {
          const remaining = bot.hand.filter((c) => c.id !== chosen.id);
          playCard(state, idx, chosen, chooseBotWishSuit(remaining));
        } else {
          playCard(state, idx, chosen, null);
        }
      } else {
        drawCards(state, idx, 1);
        advanceTurn(state, 1);
      }
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
    if (!state || state.finished || state.awaitingSuitWish) return;
    if (state.players[state.currentPlayerIndex].id !== 0) return;

    const human = state.players[0];
    const card = human.hand.find((c) => c.id === cardId);
    if (!card) return;

    if (state.pendingDraw > 0) {
      if (card.rank !== "7") return;
      playCard(state, 0, card, null);
      afterStateChange();
      return;
    }

    if (!isValidPlay(card, state)) return;

    if (card.rank === "B") {
      state.awaitingSuitWish = true;
      state.pendingWishCard = card;
      render();
      return;
    }

    playCard(state, 0, card, null);
    afterStateChange();
  }

  function handleHumanWishSuit(suit) {
    const state = gameState;
    if (!state || !state.awaitingSuitWish) return;
    const card = state.pendingWishCard;
    state.awaitingSuitWish = false;
    state.pendingWishCard = null;
    playCard(state, 0, card, suit);
    afterStateChange();
  }

  function handleHumanDraw() {
    const state = gameState;
    if (!state || state.finished || state.awaitingSuitWish) return;
    if (state.players[state.currentPlayerIndex].id !== 0) return;

    if (state.pendingDraw > 0) {
      drawCards(state, 0, state.pendingDraw);
      state.pendingDraw = 0;
      advanceTurn(state, 1);
      afterStateChange();
      return;
    }

    const human = state.players[0];
    if (getValidPlays(human.hand, state).length > 0) return; // muss spielen, wenn möglich

    drawCards(state, 0, 1);
    advanceTurn(state, 1);
    afterStateChange();
  }

  // ---- Rendering ----

  function renderCardFace(el, card) {
    el.className = "mm-card " + (isRed(card.suit) ? "mm-card--red" : "mm-card--black");
    el.textContent = "";
    const rank = document.createElement("span");
    rank.textContent = card.rank;
    const suit = document.createElement("span");
    suit.textContent = card.suit;
    suit.style.fontSize = "1.4rem";
    el.append(rank, suit);
  }

  function render() {
    const state = gameState;
    const human = state.players[0];
    const isHumanTurn = state.players[state.currentPlayerIndex].id === 0;

    // Gegner
    opponentsEl.innerHTML = "";
    state.players.slice(1).forEach((bot, i) => {
      const pill = document.createElement("div");
      pill.className = "mm-opponent" + (state.currentPlayerIndex === i + 1 ? " is-active" : "");
      const name = document.createElement("span");
      name.className = "mm-opponent-name";
      name.textContent = "🤖 " + bot.name;
      const count = document.createElement("span");
      count.className = "mm-opponent-count";
      count.textContent = `${bot.hand.length} Karte${bot.hand.length === 1 ? "" : "n"}`;
      pill.append(name, count);
      opponentsEl.appendChild(pill);
    });

    // Stapel
    drawCountEl.textContent = `${state.drawPile.length} Karten`;
    renderCardFace(discardCardEl, topCard(state));

    const wishActive = state.activeSuit !== topCard(state).suit;
    wishBadgeEl.hidden = !wishActive;
    if (wishActive) wishBadgeEl.textContent = `Gewünscht: ${state.activeSuit}`;

    const humanValidPlays = getValidPlays(human.hand, state);
    const drawIsActive =
      isHumanTurn && !state.awaitingSuitWish && (state.pendingDraw > 0 || humanValidPlays.length === 0);
    drawPileEl.classList.toggle("is-active", drawIsActive);
    drawPileEl.onclick = drawIsActive ? handleHumanDraw : null;

    // Status
    if (state.awaitingSuitWish) {
      statusEl.textContent = "Wähle eine Farbe für den Buben.";
    } else if (!isHumanTurn) {
      statusEl.textContent = `${state.players[state.currentPlayerIndex].name} ist am Zug ...`;
    } else if (state.pendingDraw > 0) {
      statusEl.textContent = `Du musst ${state.pendingDraw} Karten ziehen - oder mit einer 7 kontern.`;
    } else if (humanValidPlays.length === 0) {
      statusEl.textContent = "Keine passende Karte - ziehe eine Karte.";
    } else {
      statusEl.textContent = "Du bist dran - spiele eine passende Karte.";
    }

    // Farbwunsch-Auswahl
    suitPickerEl.hidden = !state.awaitingSuitWish;
    suitPickerEl.innerHTML = "";
    if (state.awaitingSuitWish) {
      SUITS.forEach((suit) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mm-suit-button " + (isRed(suit) ? "mm-suit-button--red" : "mm-suit-button--black");
        btn.textContent = suit;
        btn.addEventListener("click", () => handleHumanWishSuit(suit));
        suitPickerEl.appendChild(btn);
      });
    }

    // Hand
    handEl.innerHTML = "";
    human.hand.forEach((card) => {
      const el = document.createElement("div");
      renderCardFace(el, card);

      const canClickCards = isHumanTurn && !state.awaitingSuitWish;
      const isPlayable = canClickCards && (state.pendingDraw > 0 ? card.rank === "7" : isValidPlay(card, state));
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
      gameName: "Mau Mau",
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
