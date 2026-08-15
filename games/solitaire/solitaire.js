/**
 * solitaire.js
 *
 * Klassisches Solitär (Klondike), Einzelspieler. 7 Tableau-Stapel (1-7
 * Karten, jeweils nur die oberste offen), 4 Fundament-Stapel (pro Farbe
 * aufsteigend von Ass bis König), Nachziehstapel + Ablage.
 *
 * Bedienung: Karte anklicken wählt sie aus (bei einem Tableau-Stapel wird
 * die gesamte offene Folge ab der geklickten Karte mit ausgewählt). Danach
 * auf ein Ziel klicken (anderer Tableau-Stapel oder ein Fundament), um den
 * Zug auszuführen - ist das Ziel ungültig, wird stattdessen die neue Karte
 * ausgewählt. Der Nachziehstapel deckt je nach Schwierigkeit 1 oder 3
 * Karten gleichzeitig auf; ist er leer, geht die Ablage per Klick zurück
 * in den Nachziehstapel.
 *
 * Schwierigkeit steuert ausschließlich die Ziehmenge (1 = leichter, weil
 * jede Karte einzeln nutzbar ist; 3 = klassisch/schwerer). Kein Bot nötig,
 * daher keine Modus-Auswahl.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=kartenspiele";

  const HOW_TO_PLAY =
    "Du sortierst Spielkarten in absteigender Reihenfolge und abwechselnder Farbe auf den sieben Tableau-Stapeln. Ziel ist es, alle Karten nach Farbe sortiert von Ass bis König auf die vier Fundament-Stapel zu legen. Klicke eine Karte an, um sie auszuwählen, und dann ein Ziel, um sie dorthin zu verschieben. Der Nachziehstapel hilft dir, wenn du im Tableau nicht mehr weiterkommst - ist er leer, bringt ein Klick die Ablage zurück.";

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Ziehmenge vom Nachziehstapel.
  const DIFFICULTY_SETTINGS = {
    1: { drawCount: 1 },
    2: { drawCount: 1 },
    3: { drawCount: 3 },
    4: { drawCount: 3 },
    5: { drawCount: 3 },
  };

  const SUITS = ["s", "h", "d", "c"];
  const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const RED_SUITS = ["h", "d"];
  const RANK_LABEL = { 1: "A", 11: "B", 12: "D", 13: "K" };
  const COLUMN_OFFSET = 28; // px vertikaler Versatz pro gestapelter Karte

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const statusEl = document.getElementById("sol-status");
  const stockEl = document.getElementById("sol-stock");
  const wasteEl = document.getElementById("sol-waste");
  const foundationsEl = document.getElementById("sol-foundations");
  const tableauEl = document.getElementById("sol-tableau");

  let state = null;
  let lastSelection = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function rankLabel(rank) {
    return RANK_LABEL[rank] || String(rank);
  }

  function isRed(suit) {
    return RED_SUITS.includes(suit);
  }

  // ---- Deck ----

  function createDeck() {
    const deck = [];
    let n = 0;
    SUITS.forEach((suit) => {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank, id: `c${n++}`, faceUp: false });
      }
    });
    return deck;
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function deal(drawCount) {
    const deck = shuffle(createDeck());
    const tableau = [];
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      const pile = [];
      for (let i = 0; i <= col; i++) {
        const card = deck[idx++];
        card.faceUp = i === col;
        pile.push(card);
      }
      tableau.push(pile);
    }
    const stock = deck.slice(idx);
    return {
      tableau,
      stock,
      waste: [],
      foundations: { s: [], h: [], d: [], c: [] },
      drawCount,
      selection: null,
      finished: false,
    };
  }

  // ---- Regeln ----

  function drawFromStock() {
    if (state.stock.length === 0) {
      state.stock = state.waste
        .slice()
        .reverse()
        .map((c) => ({ ...c, faceUp: false }));
      state.waste = [];
      return;
    }
    const count = Math.min(state.drawCount, state.stock.length);
    for (let i = 0; i < count; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    }
  }

  function getSelectableRun(col, index) {
    const pile = state.tableau[col];
    if (index < 0 || index >= pile.length) return null;
    for (let i = index; i < pile.length; i++) {
      if (!pile[i].faceUp) return null;
    }
    return pile.slice(index);
  }

  function canDropOnTableau(destCol, run) {
    const pile = state.tableau[destCol];
    const moving = run[0];
    if (pile.length === 0) return moving.rank === 13;
    const top = pile[pile.length - 1];
    return top.faceUp && top.rank === moving.rank + 1 && isRed(top.suit) !== isRed(moving.suit);
  }

  function canDropOnFoundation(suit, card) {
    if (card.suit !== suit) return false;
    const pile = state.foundations[suit];
    if (pile.length === 0) return card.rank === 1;
    return pile[pile.length - 1].rank === card.rank - 1;
  }

  function selectionRun() {
    const sel = state.selection;
    if (!sel) return null;
    if (sel.source === "waste") {
      return state.waste.length > 0 ? [state.waste[state.waste.length - 1]] : null;
    }
    return getSelectableRun(sel.col, sel.index);
  }

  function flipExposedTop(col) {
    const pile = state.tableau[col];
    if (pile.length > 0) pile[pile.length - 1].faceUp = true;
  }

  function removeSelectionFromSource() {
    const sel = state.selection;
    if (sel.source === "waste") {
      state.waste.pop();
    } else {
      state.tableau[sel.col].splice(sel.index, state.tableau[sel.col].length - sel.index);
      flipExposedTop(sel.col);
    }
  }

  function tryMoveToTableau(destCol) {
    const run = selectionRun();
    if (!run || !canDropOnTableau(destCol, run)) return false;
    if (state.selection.source === "tableau" && state.selection.col === destCol) return false;
    removeSelectionFromSource();
    state.tableau[destCol].push(...run);
    state.selection = null;
    return true;
  }

  function tryMoveToFoundation(suit) {
    const sel = state.selection;
    if (!sel) return false;
    let card;
    if (sel.source === "waste") {
      card = state.waste[state.waste.length - 1];
    } else {
      const pile = state.tableau[sel.col];
      if (sel.index !== pile.length - 1) return false; // nur die oberste Karte darf aufs Fundament
      card = pile[pile.length - 1];
    }
    if (!card || !canDropOnFoundation(suit, card)) return false;
    removeSelectionFromSource();
    state.foundations[suit].push(card);
    state.selection = null;
    return true;
  }

  function sameSelection(a, b) {
    if (!a || !b) return false;
    if (a.source !== b.source) return false;
    if (a.source === "waste") return true;
    return a.col === b.col && a.index === b.index;
  }

  function selectSource(newSel) {
    if (sameSelection(state.selection, newSel)) {
      state.selection = null;
    } else {
      state.selection = newSel;
    }
  }

  function isWon() {
    return SUITS.every((s) => state.foundations[s].length === 13);
  }

  // ---- Interaktion ----

  function handleStockClick() {
    if (state.finished) return;
    drawFromStock();
    state.selection = null;
    render();
  }

  function handleWasteClick() {
    if (state.finished || state.waste.length === 0) return;
    selectSource({ source: "waste" });
    render();
  }

  function handleFoundationClick(suit) {
    if (state.finished) return;
    if (state.selection) {
      const moved = tryMoveToFoundation(suit);
      render();
      if (moved && isWon()) endGame();
    }
  }

  function handleTableauClick(col, index) {
    if (state.finished) return;

    if (state.selection) {
      const moved = tryMoveToTableau(col);
      if (moved) {
        render();
        return;
      }
    }

    if (index !== null) {
      const run = getSelectableRun(col, index);
      if (run) {
        selectSource({ source: "tableau", col, index });
        render();
        return;
      }
    }

    // Klick auf leere Spalte oder verdeckte Karte ohne gültigen Zug - Auswahl aufheben.
    if (!state.selection || index === null) {
      state.selection = null;
      render();
    }
  }

  // ---- Rendering ----

  function buildCardFace(card, extraClass) {
    const el = document.createElement("div");
    el.className = "sol-card " + (isRed(card.suit) ? "sol-card--red" : "sol-card--black") + (extraClass ? " " + extraClass : "");

    function corner(bottom) {
      const c = document.createElement("span");
      c.className = "sol-card__corner" + (bottom ? " sol-card__corner--bottom" : "");
      const rank = document.createElement("span");
      rank.textContent = rankLabel(card.rank);
      const suit = document.createElement("span");
      suit.className = "sol-card__corner-suit";
      suit.textContent = SUIT_SYMBOL[card.suit];
      c.append(rank, suit);
      return c;
    }

    const pip = document.createElement("span");
    pip.className = "sol-card__pip";
    pip.textContent = SUIT_SYMBOL[card.suit];

    el.append(corner(false), pip, corner(true));
    return el;
  }

  function buildBack(extraClass) {
    const el = document.createElement("div");
    el.className = "sol-card sol-card--back" + (extraClass ? " " + extraClass : "");
    return el;
  }

  function buildPlaceholder(symbol) {
    const el = document.createElement("div");
    el.className = "sol-card sol-card--placeholder";
    if (symbol) el.textContent = symbol;
    return el;
  }

  function render() {
    // Stock
    stockEl.innerHTML = "";
    stockEl.classList.toggle("is-droppable", !state.finished);
    if (state.stock.length > 0) {
      stockEl.appendChild(buildBack());
    } else {
      const ph = buildPlaceholder(state.waste.length > 0 ? "↺" : "");
      stockEl.appendChild(ph);
    }
    stockEl.onclick = () => handleStockClick();

    // Waste
    wasteEl.innerHTML = "";
    if (state.waste.length > 0) {
      const top = state.waste[state.waste.length - 1];
      const isSelected = state.selection && state.selection.source === "waste";
      const face = buildCardFace(top, "is-selectable" + (isSelected ? " is-selected" : ""));
      face.addEventListener("click", (e) => {
        e.stopPropagation();
        handleWasteClick();
      });
      wasteEl.appendChild(face);
    } else {
      wasteEl.appendChild(buildPlaceholder());
    }

    // Fundamente
    foundationsEl.innerHTML = "";
    SUITS.forEach((suit) => {
      const pile = state.foundations[suit];
      const wrap = document.createElement("div");
      wrap.className = "sol-pile";
      wrap.addEventListener("click", () => handleFoundationClick(suit));
      if (pile.length > 0) {
        wrap.appendChild(buildCardFace(pile[pile.length - 1]));
      } else {
        wrap.appendChild(buildPlaceholder(SUIT_SYMBOL[suit]));
      }
      foundationsEl.appendChild(wrap);
    });

    // Tableau
    tableauEl.innerHTML = "";
    state.tableau.forEach((pile, col) => {
      const colEl = document.createElement("div");
      colEl.className = "sol-column";
      colEl.addEventListener("click", () => handleTableauClick(col, null));

      if (pile.length === 0) {
        const ph = buildPlaceholder();
        ph.style.position = "static";
        colEl.appendChild(ph);
      }

      pile.forEach((card, index) => {
        const isSelected =
          state.selection &&
          state.selection.source === "tableau" &&
          state.selection.col === col &&
          index >= state.selection.index;

        const el = card.faceUp
          ? buildCardFace(card, "is-selectable" + (isSelected ? " is-selected" : ""))
          : buildBack();
        el.style.top = index * COLUMN_OFFSET + "px";
        el.style.zIndex = String(index);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          handleTableauClick(col, card.faceUp ? index : null);
        });
        colEl.appendChild(el);
      });

      tableauEl.appendChild(colEl);
    });

    // Status
    if (state.finished) {
      // wird über den Ergebnis-Bildschirm angezeigt
    } else {
      const remaining = 52 - SUITS.reduce((sum, s) => sum + state.foundations[s].length, 0);
      statusEl.textContent = `${remaining} Karten übrig - Stapel: ${state.stock.length}`;
    }
  }

  function endGame() {
    state.finished = true;
    PixelPortGameScreens.renderResult(resultScreen, {
      title: "🏆 Geschafft!",
      message: "Alle Karten sind auf den Fundamenten.",
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function startGame(selection) {
    lastSelection = selection;
    const settings = DIFFICULTY_SETTINGS[selection.difficulty.id];
    state = deal(settings.drawCount);
    showScreen(playScreen);
    render();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Solitär",
      icon: "🂡",
      intro: "Wähle die Schwierigkeit, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      defaultDifficultyId: 3,
      backHref: CATEGORY_URL,
      backLabel: "← Zurück zu Kartenspiele",
      onStart: startGame,
    });
  }

  showScreen(setupScreen);
  initSetup();
})();
