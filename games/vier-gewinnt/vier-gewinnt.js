/**
 * vier-gewinnt.js
 *
 * Klassisches Vier Gewinnt (7 Spalten x 6 Reihen). Spieler klicken eine
 * Spalte an, die Scheibe fällt auf das unterste freie Feld. Gewonnen hat,
 * wer zuerst vier eigene Scheiben in eine Reihe bekommt (waagerecht,
 * senkrecht oder diagonal).
 *
 * KI: Minimax mit Alpha-Beta-Pruning (gleiches Muster wie bei Schach,
 * inkl. zeitbegrenzter iterativer Tiefensuche als Sicherheitsnetz gegen
 * zu lange Rechenzeit) plus eine kompakte Fenster-Heuristik. Schwierigkeit
 * steuert die Suchtiefe und einen Zufallsanteil, damit niedrige Stufen
 * wirklich schlagbar bleiben.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=brettspiele-digital";

  const HOW_TO_PLAY =
    "Zwei Spieler werfen abwechselnd Spielsteine in eines von mehreren senkrechten Feldern, die sich von unten füllen. Ziel ist es, als Erster vier eigene Steine in einer Reihe zu bekommen - waagerecht, senkrecht oder diagonal. Wer das zuerst schafft, gewinnt.";

  const MODES = [
    { id: "2p", label: "2 Spieler", description: "Beide Seiten werden von Menschen gesteuert." },
    { id: "bot", label: "Gegen Bot", description: "Gelb wird von einer KI gesteuert, Rot spielst du." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Suchtiefe + Zufallsanteil.
  const DIFFICULTY_SETTINGS = {
    1: { maxDepth: 1, timeLimit: 200, randomness: 0.6 },
    2: { maxDepth: 2, timeLimit: 250, randomness: 0.3 },
    3: { maxDepth: 4, timeLimit: 400, randomness: 0.08 },
    4: { maxDepth: 6, timeLimit: 700, randomness: 0 },
    5: { maxDepth: 9, timeLimit: 1300, randomness: 0 },
  };

  const ROWS = 6;
  const COLS = 7;
  const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6]; // Mitte zuerst - bessere Alpha-Beta-Pruning-Effizienz
  const AI_THINK_DELAY = 200;

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const boardEl = document.getElementById("c4-board");
  const statusEl = document.getElementById("c4-status");
  const hintEl = document.getElementById("game-hint");

  let gameState = null; // { board, turn, mode, settings, finished, aiThinking }
  let lastSelection = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function createEmptyBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  }

  function getValidColumns(board) {
    const cols = [];
    for (const c of COLUMN_ORDER) if (!board[0][c]) cols.push(c);
    return cols;
  }

  function dropDisc(board, col, player) {
    const next = board.map((row) => row.slice());
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!next[r][col]) {
        next[r][col] = player;
        return { board: next, row: r };
      }
    }
    return { board: next, row: -1 };
  }

  function findWinner(board) {
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const player = board[r][c];
        if (!player) continue;
        for (const [dr, dc] of dirs) {
          let count = 1;
          for (let k = 1; k < 4; k++) {
            const nr = r + dr * k;
            const nc = c + dc * k;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
            count++;
          }
          if (count >= 4) return player;
        }
      }
    }
    return null;
  }

  function isBoardFull(board) {
    return board[0].every((cell) => cell !== null);
  }

  // ---- KI ----

  function scoreWindow(cells, aiPlayer, humanPlayer) {
    const aiCount = cells.filter((c) => c === aiPlayer).length;
    const humanCount = cells.filter((c) => c === humanPlayer).length;
    const emptyCount = cells.filter((c) => c === null).length;

    if (aiCount > 0 && humanCount > 0) return 0; // gemischtes Fenster, für niemanden mehr nutzbar
    if (aiCount === 3 && emptyCount === 1) return 50;
    if (aiCount === 2 && emptyCount === 2) return 10;
    if (humanCount === 3 && emptyCount === 1) return -60;
    if (humanCount === 2 && emptyCount === 2) return -12;
    return 0;
  }

  function evaluateBoard(board, aiPlayer, humanPlayer) {
    let score = 0;

    for (let r = 0; r < ROWS; r++) {
      score += (board[r][3] === aiPlayer ? 1 : board[r][3] === humanPlayer ? -1 : 0) * 3;
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        score += scoreWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]], aiPlayer, humanPlayer);
      }
    }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r <= ROWS - 4; r++) {
        score += scoreWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]], aiPlayer, humanPlayer);
      }
    }
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        score += scoreWindow(
          [board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]],
          aiPlayer,
          humanPlayer
        );
        score += scoreWindow(
          [board[r + 3][c], board[r + 2][c + 1], board[r + 1][c + 2], board[r][c + 3]],
          aiPlayer,
          humanPlayer
        );
      }
    }
    return score;
  }

  let searchDeadline = 0;
  let nodeCount = 0;
  function SearchTimeout() {}
  SearchTimeout.prototype = Object.create(Error.prototype);

  function negamax(board, depth, alpha, beta, player, opponent, aiPlayer) {
    nodeCount++;
    if ((nodeCount & 1023) === 0 && performance.now() > searchDeadline) throw new SearchTimeout();

    const winner = findWinner(board);
    if (winner === player) return 1000000 + depth;
    if (winner === opponent) return -1000000 - depth;

    const validCols = getValidColumns(board);
    if (validCols.length === 0) return 0;
    if (depth === 0) {
      const raw = evaluateBoard(board, aiPlayer, aiPlayer === player ? opponent : player);
      return aiPlayer === player ? raw : -raw;
    }

    let best = -Infinity;
    for (const col of validCols) {
      const { board: next } = dropDisc(board, col, player);
      const score = -negamax(next, depth - 1, -beta, -alpha, opponent, player, aiPlayer);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function findBestMoveWithinTime(board, aiPlayer, humanPlayer, maxDepth, timeLimitMs) {
    const validCols = getValidColumns(board);
    if (validCols.length === 0) return null;

    searchDeadline = performance.now() + timeLimitMs;
    nodeCount = 0;

    let best = validCols[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        let depthBest = validCols[0];
        let depthBestScore = -Infinity;
        for (const col of validCols) {
          const { board: next } = dropDisc(board, col, aiPlayer);
          const score = -negamax(next, depth - 1, -Infinity, Infinity, humanPlayer, aiPlayer, aiPlayer);
          if (score > depthBestScore) {
            depthBestScore = score;
            depthBest = col;
          }
        }
        best = depthBest;
      } catch (err) {
        if (err instanceof SearchTimeout) break;
        throw err;
      }
      if (performance.now() > searchDeadline) break;
    }
    return best;
  }

  function chooseAiMove(board, aiPlayer, humanPlayer, settings) {
    const validCols = getValidColumns(board);
    if (validCols.length === 0) return null;
    if (Math.random() < settings.randomness) {
      return validCols[Math.floor(Math.random() * validCols.length)];
    }
    const move = findBestMoveWithinTime(board, aiPlayer, humanPlayer, settings.maxDepth, settings.timeLimit);
    return move === null ? validCols[0] : move;
  }

  // ---- Spielsteuerung ----

  function handleColumnClick(col) {
    if (!gameState || gameState.finished || gameState.aiThinking) return;
    if (gameState.mode === "bot" && gameState.turn === "p2") return;
    playMove(col);
  }

  function playMove(col) {
    const { board } = dropDisc(gameState.board, col, gameState.turn);
    gameState.board = board;

    const winner = findWinner(board);
    if (winner) {
      gameState.finished = true;
      render();
      endGame(winner);
      return;
    }
    if (isBoardFull(board)) {
      gameState.finished = true;
      render();
      endGame(null);
      return;
    }

    gameState.turn = gameState.turn === "p1" ? "p2" : "p1";
    render();

    if (gameState.mode === "bot" && gameState.turn === "p2") {
      gameState.aiThinking = true;
      render();
      setTimeout(runAiMove, AI_THINK_DELAY);
    }
  }

  function runAiMove() {
    if (!gameState || gameState.finished) return;
    const col = chooseAiMove(gameState.board, "p2", "p1", gameState.settings);
    gameState.aiThinking = false;
    if (col === null) {
      render();
      return;
    }
    playMove(col);
  }

  function updateStatus() {
    if (gameState.finished) return;
    if (gameState.aiThinking) {
      statusEl.textContent = "🤔 Der Bot denkt nach ...";
      return;
    }
    if (gameState.mode === "bot") {
      statusEl.textContent = gameState.turn === "p1" ? "Du bist am Zug (Rot)" : "Bot ist am Zug (Gelb)";
    } else {
      statusEl.textContent = gameState.turn === "p1" ? "Spieler 1 ist am Zug (Rot)" : "Spieler 2 ist am Zug (Gelb)";
    }
  }

  function render() {
    updateStatus();

    const clickable = !gameState.finished && !gameState.aiThinking && !(gameState.mode === "bot" && gameState.turn === "p2");

    boardEl.innerHTML = "";
    for (let c = 0; c < COLS; c++) {
      const column = document.createElement("div");
      column.className = "c4-column" + (clickable ? "" : " is-disabled");
      if (clickable) column.addEventListener("click", () => handleColumnClick(c));

      for (let r = 0; r < ROWS; r++) {
        const cell = document.createElement("div");
        const value = gameState.board[r][c];
        cell.className = "c4-cell " + (value ? "c4-cell--" + value : "is-empty");
        column.appendChild(cell);
      }
      boardEl.appendChild(column);
    }
  }

  function endGame(winner) {
    let title;
    if (!winner) {
      title = "🤝 Unentschieden!";
    } else if (gameState.mode === "bot") {
      title = winner === "p1" ? "🏆 Du gewinnst!" : "🏆 Der Bot gewinnt!";
    } else {
      title = winner === "p1" ? "🏆 Spieler 1 gewinnt!" : "🏆 Spieler 2 gewinnt!";
    }

    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message: winner ? (winner === "p1" ? "Vier rote Steine in einer Reihe!" : "Vier gelbe Steine in einer Reihe!") : "Das Brett ist voll.",
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function startGame(selection) {
    lastSelection = selection;
    gameState = {
      board: createEmptyBoard(),
      turn: "p1",
      mode: selection.mode.id,
      settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
      finished: false,
      aiThinking: false,
    };
    hintEl.textContent =
      gameState.mode === "bot" ? "Du spielst Rot, der Bot spielt Gelb." : "Spieler 1 = Rot, Spieler 2 = Gelb.";
    showScreen(playScreen);
    render();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Vier Gewinnt",
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
