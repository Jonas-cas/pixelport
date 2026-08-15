/**
 * dame.js
 *
 * Klassisches Dame (8x8, jeder Spieler startet mit 12 Steinen auf den
 * dunklen Feldern). Einfache Steine ziehen/schlagen nur vorwärts
 * diagonal, Damen (nach Aufstieg an der gegnerischen Grundreihe) in alle
 * vier diagonalen Richtungen - jeweils ein Feld pro Zug (keine
 * "fliegende Dame"). Es gilt Schlagzwang: existiert ein Schlagzug,
 * müssen Schlagzüge gespielt werden, und ein Mehrfachschlag mit
 * derselben Figur muss fortgesetzt werden, solange möglich.
 *
 * KI: gleiches Muster wie Schach/Vier Gewinnt (Negamax mit Alpha-Beta
 * und zeitbegrenzter iterativer Tiefensuche). Damit der Suchbaum trotz
 * Mehrfachschlägen sauber bleibt, wird pro Spieler-Zug eine vollständige
 * "Zugsequenz" (ein normaler Zug ODER eine ganze Schlagkette) als ein
 * Suchschritt behandelt - der Zugwechsel passiert also erst nach dem
 * Ende einer Schlagkette, genau wie im echten Spiel.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=brettspiele-digital";

  const HOW_TO_PLAY =
    "Zwei Spieler bewegen ihre Steine diagonal über ein Schachbrett-Feld. Springt man diagonal über einen gegnerischen Stein und die Landefläche dahinter ist frei, wird dieser geschlagen und entfernt. Wer alle gegnerischen Steine schlägt oder bewegungsunfähig macht, gewinnt. Ist ein Schlagzug möglich, muss geschlagen werden (Schlagzwang).";

  const MODES = [
    { id: "2p", label: "2 Spieler", icon: "🧑‍🤝‍🧑", description: "Beide Seiten werden von Menschen gesteuert." },
    { id: "bot", label: "Gegen Bot", icon: "🤖", description: "Schwarz wird von einer KI gesteuert, Weiß spielst du." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Suchtiefe + Zufallsanteil.
  const DIFFICULTY_SETTINGS = {
    1: { maxDepth: 1, timeLimit: 200, randomness: 0.6 },
    2: { maxDepth: 2, timeLimit: 300, randomness: 0.3 },
    3: { maxDepth: 4, timeLimit: 500, randomness: 0.08 },
    4: { maxDepth: 6, timeLimit: 900, randomness: 0 },
    5: { maxDepth: 9, timeLimit: 1500, randomness: 0 },
  };

  const MAN_DIRS = { w: [[-1, -1], [-1, 1]], b: [[1, -1], [1, 1]] };
  const KING_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const MAN_VALUE = 100;
  const KING_VALUE = 160;
  const AI_THINK_DELAY = 250;

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const boardEl = document.getElementById("dame-board");
  const statusEl = document.getElementById("dame-status");

  let gameState = null; // { board, turn, chainFrom, mode, settings, finished, aiThinking }
  let lastSelection = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function isDarkSquare(r, c) {
    return (r + c) % 2 === 1;
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function createInitialBoard() {
    const board = Array.from({ length: 8 }, () => new Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (!isDarkSquare(r, c)) continue;
        if (r < 3) board[r][c] = { color: "b", king: false };
        else if (r > 4) board[r][c] = { color: "w", king: false };
      }
    }
    return board;
  }

  // ---- Zuggenerierung ----

  function generateMovesForPiece(board, r, c) {
    const piece = board[r][c];
    const dirs = piece.king ? KING_DIRS : MAN_DIRS[piece.color];
    const moves = [];

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && !board[nr][nc]) {
        moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc }, capture: null });
      }
    }
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const jr = r + dr * 2;
      const jc = c + dc * 2;
      if (
        inBounds(jr, jc) &&
        inBounds(nr, nc) &&
        board[nr][nc] &&
        board[nr][nc].color !== piece.color &&
        !board[jr][jc]
      ) {
        moves.push({ from: { row: r, col: c }, to: { row: jr, col: jc }, capture: { row: nr, col: nc } });
      }
    }
    return moves;
  }

  /** Alle Züge für color, unter Berücksichtigung des Schlagzwangs. */
  function getAllMoves(board, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === color) moves.push(...generateMovesForPiece(board, r, c));
      }
    }
    const captures = moves.filter((m) => m.capture);
    return captures.length > 0 ? captures : moves;
  }

  function applyMove(board, move) {
    const next = cloneBoard(board);
    const piece = next[move.from.row][move.from.col];
    next[move.from.row][move.from.col] = null;
    if (move.capture) next[move.capture.row][move.capture.col] = null;

    const promotionRow = piece.color === "w" ? 0 : 7;
    const king = piece.king || move.to.row === promotionRow;
    next[move.to.row][move.to.col] = { color: piece.color, king };

    return next;
  }

  /**
   * Liefert alle vollständigen Zugsequenzen für color (ein normaler Zug
   * oder eine komplette Schlagkette bis zu ihrem Ende) - die "Züge", mit
   * denen die KI-Suche arbeitet, damit der Zugwechsel exakt nach einer
   * kompletten Schlagkette passiert.
   */
  function getCompleteTurns(board, color) {
    const moves = getAllMoves(board, color);
    if (moves.length === 0) return [];
    if (!moves[0].capture) return moves.map((m) => [m]);

    const sequences = [];
    function extend(currentBoard, seq, row, col) {
      const further = generateMovesForPiece(currentBoard, row, col).filter((m) => m.capture);
      if (further.length === 0) {
        sequences.push(seq);
        return;
      }
      for (const m of further) {
        extend(applyMove(currentBoard, m), seq.concat([m]), m.to.row, m.to.col);
      }
    }
    for (const m of moves) {
      extend(applyMove(board, m), [m], m.to.row, m.to.col);
    }
    return sequences;
  }

  // ---- Bewertung & KI ----

  function evaluateBoard(board, aiColor, humanColor) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        let value = piece.king ? KING_VALUE : MAN_VALUE;
        if (!piece.king) {
          // Fortschritt Richtung Aufstieg leicht belohnen.
          value += piece.color === "w" ? (7 - r) * 2 : r * 2;
        }
        // Zentrale Felder sind taktisch wertvoller als der Rand.
        value += 4 - Math.min(c, 7 - c);
        score += piece.color === aiColor ? value : piece.color === humanColor ? -value : 0;
      }
    }
    return score;
  }

  let searchDeadline = 0;
  let nodeCount = 0;
  function SearchTimeout() {}
  SearchTimeout.prototype = Object.create(Error.prototype);

  function negamax(board, color, opponent, depth, alpha, beta, aiColor) {
    nodeCount++;
    if ((nodeCount & 511) === 0 && performance.now() > searchDeadline) throw new SearchTimeout();

    const turns = getCompleteTurns(board, color);
    if (turns.length === 0) return -1000000 - depth;
    if (depth === 0) {
      const raw = evaluateBoard(board, aiColor, aiColor === color ? opponent : color);
      return aiColor === color ? raw : -raw;
    }

    let best = -Infinity;
    for (const turn of turns) {
      let next = board;
      for (const move of turn) next = applyMove(next, move);
      const score = -negamax(next, opponent, color, depth - 1, -beta, -alpha, aiColor);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function findBestMoveWithinTime(board, aiColor, humanColor, maxDepth, timeLimitMs) {
    const turns = getCompleteTurns(board, aiColor);
    if (turns.length === 0) return null;

    searchDeadline = performance.now() + timeLimitMs;
    nodeCount = 0;

    let best = turns[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        let depthBest = turns[0];
        let depthBestScore = -Infinity;
        for (const turn of turns) {
          let next = board;
          for (const move of turn) next = applyMove(next, move);
          const score = -negamax(next, humanColor, aiColor, depth - 1, -Infinity, Infinity, aiColor);
          if (score > depthBestScore) {
            depthBestScore = score;
            depthBest = turn;
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

  function chooseAiTurn(board, aiColor, humanColor, settings) {
    const turns = getCompleteTurns(board, aiColor);
    if (turns.length === 0) return null;
    if (Math.random() < settings.randomness) {
      return turns[Math.floor(Math.random() * turns.length)];
    }
    return findBestMoveWithinTime(board, aiColor, humanColor, settings.maxDepth, settings.timeLimit) || turns[0];
  }

  // ---- Spielsteuerung ----

  function legalMovesFromSquare(square) {
    const { board, turn, chainFrom } = gameState;
    if (chainFrom) {
      if (chainFrom.row !== square.row || chainFrom.col !== square.col) return [];
      return generateMovesForPiece(board, square.row, square.col).filter((m) => m.capture);
    }
    return getAllMoves(board, turn).filter((m) => m.from.row === square.row && m.from.col === square.col);
  }

  function handleSquareClick(row, col) {
    if (!gameState || gameState.finished || gameState.aiThinking) return;
    if (gameState.mode === "bot" && gameState.turn === "b") return;

    const { board, selected } = gameState;

    if (selected) {
      const moves = legalMovesFromSquare(selected);
      const move = moves.find((m) => m.to.row === row && m.to.col === col);
      if (move) {
        applyHumanMove(move);
        return;
      }
    }

    if (gameState.chainFrom) {
      render();
      return; // während einer Schlagkette ist nur die aktive Figur wählbar
    }

    const piece = board[row][col];
    if (piece && piece.color === gameState.turn && legalMovesFromSquare({ row, col }).length > 0) {
      gameState.selected = { row, col };
    } else {
      gameState.selected = null;
    }
    render();
  }

  function applyHumanMove(move) {
    gameState.board = applyMove(gameState.board, move);
    gameState.selected = null;

    if (move.capture) {
      const further = generateMovesForPiece(gameState.board, move.to.row, move.to.col).filter((m) => m.capture);
      if (further.length > 0) {
        gameState.chainFrom = { row: move.to.row, col: move.to.col };
        render();
        return;
      }
    }

    gameState.chainFrom = null;
    endTurn();
  }

  function endTurn() {
    gameState.turn = gameState.turn === "w" ? "b" : "w";

    if (getAllMoves(gameState.board, gameState.turn).length === 0) {
      gameState.finished = true;
      render();
      endGame(gameState.turn === "w" ? "b" : "w");
      return;
    }

    render();

    if (gameState.mode === "bot" && gameState.turn === "b") {
      gameState.aiThinking = true;
      render();
      setTimeout(runAiMove, AI_THINK_DELAY);
    }
  }

  function runAiMove() {
    if (!gameState || gameState.finished) return;
    const turn = chooseAiTurn(gameState.board, "b", "w", gameState.settings);
    gameState.aiThinking = false;
    if (!turn) {
      render();
      return;
    }
    for (const move of turn) {
      gameState.board = applyMove(gameState.board, move);
    }
    gameState.chainFrom = null;
    endTurn();
  }

  function updateStatus() {
    if (gameState.finished) return;
    if (gameState.aiThinking) {
      statusEl.textContent = "🤔 Der Bot denkt nach ...";
      return;
    }
    const chaining = gameState.chainFrom ? " – weiterschlagen!" : "";
    if (gameState.mode === "bot") {
      statusEl.textContent = (gameState.turn === "w" ? "Du bist am Zug" : "Bot ist am Zug") + chaining;
    } else {
      statusEl.textContent = (gameState.turn === "w" ? "Weiß ist am Zug" : "Schwarz ist am Zug") + chaining;
    }
  }

  function render() {
    if (!gameState) return;
    updateStatus();

    const { board, selected, mode, turn, finished, aiThinking } = gameState;
    const legalTargets = selected ? legalMovesFromSquare(selected) : [];

    boardEl.innerHTML = "";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const square = document.createElement("div");
        const isLight = (r + c) % 2 === 0;
        square.className = "dame-square " + (isLight ? "dame-square--light" : "dame-square--dark");

        if (selected && selected.row === r && selected.col === c) {
          square.classList.add("is-selected");
        }
        const targetMove = legalTargets.find((m) => m.to.row === r && m.to.col === c);
        if (targetMove) {
          square.classList.add("is-target", "is-clickable");
        }

        const piece = board[r][c];
        const canSelect =
          !finished &&
          !aiThinking &&
          piece &&
          piece.color === turn &&
          !(mode === "bot" && turn === "b") &&
          legalMovesFromSquare({ row: r, col: c }).length > 0;
        if (canSelect) square.classList.add("is-clickable");

        if (piece) {
          const disc = document.createElement("div");
          disc.className = "dame-piece dame-piece--" + piece.color;
          if (piece.king) disc.textContent = "👑";
          square.appendChild(disc);
        }

        square.addEventListener("click", () => handleSquareClick(r, c));
        boardEl.appendChild(square);
      }
    }
  }

  function endGame(winnerColor) {
    const label =
      gameState.mode === "bot" ? (winnerColor === "w" ? "Du" : "Der Bot") : winnerColor === "w" ? "Weiß" : "Schwarz";

    PixelPortGameScreens.renderResult(resultScreen, {
      title: `🏆 ${label} gewinnt!`,
      message: "Der Gegner kann nicht mehr ziehen.",
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function startGame(selection) {
    lastSelection = selection;
    gameState = {
      board: createInitialBoard(),
      turn: "w",
      selected: null,
      chainFrom: null,
      mode: selection.mode.id,
      settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
      finished: false,
      aiThinking: false,
    };
    showScreen(playScreen);
    render();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Dame",
      icon: "👑",
      intro: "Wähle Schwierigkeit und Spielmodus, um zu starten.",
      howToPlay: HOW_TO_PLAY,
      modes: MODES,
      defaultDifficultyId: 3,
      defaultModeId: "2p",
      backHref: CATEGORY_URL,
      backLabel: "← Zurück zu Brettspiele",
      onStart: startGame,
    });
  }

  showScreen(setupScreen);
  initSetup();
})();
