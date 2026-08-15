/**
 * tic-tac-toe.js
 *
 * Klassisches Tic-Tac-Toe auf einem 3x3-Feld (flaches Array, Index 0-8,
 * Reihe = floor(i/3), Spalte = i%3). Zwei Spieler oder gegen Bot.
 *
 * KI: vollständiger Minimax (das Spiel ist klein genug, um es komplett
 * durchzurechnen - keine Tiefenbegrenzung nötig). "Sehr schwer" spielt
 * dadurch perfekt (nie zu schlagen, bestenfalls Unentschieden) - das ist
 * bei Tic-Tac-Toe korrekt und erwartbar. Niedrigere Schwierigkeitsstufen
 * ignorieren den optimalen Zug mit einer gewissen Wahrscheinlichkeit und
 * spielen stattdessen zufällig, damit sie wirklich schlagbar bleiben.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=brettspiele-digital";

  const HOW_TO_PLAY =
    "Auf einem 3x3-Feld setzen zwei Spieler abwechselnd ihr Symbol (X oder O) in ein freies Feld. Wer zuerst drei eigene Symbole in einer Reihe hat - waagerecht, senkrecht oder diagonal - gewinnt. Sind alle Felder voll ohne Gewinner, endet die Partie unentschieden.";

  const MODES = [
    { id: "2p", label: "2 Spieler", description: "Beide Seiten werden von Menschen gesteuert." },
    { id: "bot", label: "Gegen Bot", description: "O wird von einer KI gesteuert, X spielst du." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Zufallsanteil (0 = perfekte KI).
  const DIFFICULTY_SETTINGS = {
    1: { randomness: 0.85 },
    2: { randomness: 0.55 },
    3: { randomness: 0.25 },
    4: { randomness: 0.05 },
    5: { randomness: 0 },
  };

  const LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  const AI_THINK_DELAY = 300;

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const boardEl = document.getElementById("ttt-board");
  const statusEl = document.getElementById("ttt-status");
  const hintEl = document.getElementById("game-hint");

  let gameState = null; // { board, turn, mode, settings, finished, aiThinking, winningLine }
  let lastSelection = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function checkResult(board) {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line };
      }
    }
    if (board.every((cell) => cell !== null)) return { winner: null, line: null, draw: true };
    return null;
  }

  function emptyIndices(board) {
    const result = [];
    board.forEach((v, i) => {
      if (v === null) result.push(i);
    });
    return result;
  }

  // ---- KI: vollständiger Minimax ----

  function minimax(board, player, aiPlayer, humanPlayer, depth) {
    const result = checkResult(board);
    if (result) {
      if (result.winner === aiPlayer) return 10 - depth;
      if (result.winner === humanPlayer) return depth - 10;
      return 0;
    }

    const scores = emptyIndices(board).map((i) => {
      board[i] = player;
      const score = minimax(board, player === aiPlayer ? humanPlayer : aiPlayer, aiPlayer, humanPlayer, depth + 1);
      board[i] = null;
      return score;
    });
    return player === aiPlayer ? Math.max(...scores) : Math.min(...scores);
  }

  function findBestMove(board, aiPlayer, humanPlayer) {
    let bestScore = -Infinity;
    let bestMove = emptyIndices(board)[0];
    for (const i of emptyIndices(board)) {
      board[i] = aiPlayer;
      const score = minimax(board, humanPlayer, aiPlayer, humanPlayer, 0);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
    return bestMove;
  }

  function chooseAiMove(board, aiPlayer, humanPlayer, settings) {
    const empties = emptyIndices(board);
    if (empties.length === 0) return null;
    if (Math.random() < settings.randomness) {
      return empties[Math.floor(Math.random() * empties.length)];
    }
    return findBestMove(board, aiPlayer, humanPlayer);
  }

  // ---- Spielsteuerung ----

  function handleCellClick(index) {
    if (!gameState || gameState.finished || gameState.aiThinking) return;
    if (gameState.board[index] !== null) return;
    if (gameState.mode === "bot" && gameState.turn === "o") return;
    playMove(index);
  }

  function playMove(index) {
    gameState.board[index] = gameState.turn;

    const result = checkResult(gameState.board);
    if (result) {
      gameState.finished = true;
      gameState.winningLine = result.line;
      render();
      endGame(result.winner);
      return;
    }

    gameState.turn = gameState.turn === "x" ? "o" : "x";
    render();

    if (gameState.mode === "bot" && gameState.turn === "o") {
      gameState.aiThinking = true;
      render();
      setTimeout(runAiMove, AI_THINK_DELAY);
    }
  }

  function runAiMove() {
    if (!gameState || gameState.finished) return;
    const index = chooseAiMove(gameState.board, "o", "x", gameState.settings);
    gameState.aiThinking = false;
    if (index === null) {
      render();
      return;
    }
    playMove(index);
  }

  function updateStatus() {
    if (gameState.finished) return;
    if (gameState.aiThinking) {
      statusEl.textContent = "🤔 Der Bot denkt nach ...";
      return;
    }
    if (gameState.mode === "bot") {
      statusEl.textContent = gameState.turn === "x" ? "Du bist am Zug (X)" : "Bot ist am Zug (O)";
    } else {
      statusEl.textContent = gameState.turn === "x" ? "Spieler 1 ist am Zug (X)" : "Spieler 2 ist am Zug (O)";
    }
  }

  function render() {
    updateStatus();

    const clickable =
      !gameState.finished && !gameState.aiThinking && !(gameState.mode === "bot" && gameState.turn === "o");

    boardEl.innerHTML = "";
    gameState.board.forEach((value, index) => {
      const cell = document.createElement("div");
      const isWinning = gameState.winningLine && gameState.winningLine.includes(index);
      cell.className =
        "ttt-cell" +
        (value ? " ttt-cell--" + value : "") +
        (isWinning ? " is-winning" : "") +
        (clickable && !value ? " is-clickable" : "");
      cell.textContent = value ? (value === "x" ? "❌" : "⭕") : "";
      if (clickable && !value) cell.addEventListener("click", () => handleCellClick(index));
      boardEl.appendChild(cell);
    });
  }

  function endGame(winner) {
    let title;
    if (!winner) {
      title = "🤝 Unentschieden!";
    } else if (gameState.mode === "bot") {
      title = winner === "x" ? "🏆 Du gewinnst!" : "🏆 Der Bot gewinnt!";
    } else {
      title = winner === "x" ? "🏆 Spieler 1 gewinnt!" : "🏆 Spieler 2 gewinnt!";
    }

    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message: winner ? `Drei ${winner === "x" ? "X" : "O"} in einer Reihe!` : "Das Feld ist voll.",
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function startGame(selection) {
    lastSelection = selection;
    gameState = {
      board: new Array(9).fill(null),
      turn: "x",
      mode: selection.mode.id,
      settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
      finished: false,
      aiThinking: false,
      winningLine: null,
    };
    hintEl.textContent = gameState.mode === "bot" ? "Du spielst X, der Bot spielt O." : "Spieler 1 = X, Spieler 2 = O.";
    showScreen(playScreen);
    render();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Tic-Tac-Toe",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "2p",
      onStart: startGame,
    });
  }

  showScreen(setupScreen);
  initSetup();
})();
