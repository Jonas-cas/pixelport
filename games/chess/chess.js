/**
 * chess.js
 *
 * Vollständige Schachregeln (Rochade, En Passant, Schach-/Matt-/Patt-
 * Erkennung) plus eine einfache KI (Minimax mit Alpha-Beta-Pruning).
 * Bauern werden automatisch zur Dame umgewandelt (die mit Abstand
 * häufigste Wahl) - ein bewusster Verzicht auf einen eigenen
 * Umwandlungs-Dialog, um das Spiel nicht unnötig zu verkomplizieren.
 *
 * Schwierigkeit wirkt sich auf die Bot-Stärke aus (DIFFICULTY_SETTINGS):
 * Suchtiefe der KI und ein Zufallsanteil, der auch bei geringer Tiefe noch
 * einen spürbaren Unterschied zwischen "Sehr leicht" und "Schwer" macht.
 */

(function () {
  "use strict";

  const CATEGORY_URL = "../../category.html?id=brettspiele-digital";

  const HOW_TO_PLAY =
    "Zwei Spieler bewegen abwechselnd ihre Figuren auf einem 8x8-Feld, wobei jede Figur eigene Zugregeln hat. Ziel ist es, den gegnerischen König so anzugreifen, dass er nicht mehr entkommen kann (Schachmatt). Zieht eine eigene Figur auf das Feld einer gegnerischen, wird diese geschlagen.";

  const MODES = [
    { id: "2p", label: "2 Spieler", icon: "🧑‍🤝‍🧑", description: "Beide Seiten werden von Menschen gesteuert." },
    { id: "bot", label: "Gegen Bot", icon: "🤖", description: "Schwarz wird von einer KI gesteuert, Weiß spielst du." },
  ];

  // Schwierigkeitsstufe (id aus PixelPortGameScreens.DIFFICULTIES) -> Such­tiefe
  // der KI (als Obergrenze), Zeitbudget in ms (siehe iterative Tiefensuche
  // weiter unten) und Zufallsanteil.
  const DIFFICULTY_SETTINGS = {
    1: { maxDepth: 1, timeLimit: 200, randomness: 0.7 },
    2: { maxDepth: 2, timeLimit: 300, randomness: 0.35 },
    3: { maxDepth: 3, timeLimit: 500, randomness: 0.12 },
    4: { maxDepth: 4, timeLimit: 900, randomness: 0 },
    5: { maxDepth: 6, timeLimit: 1500, randomness: 0 },
  };

  const AI_THINK_DELAY = 200; // ms, nur damit "Bot denkt nach ..." kurz sichtbar wird

  const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const PIECE_GLYPHS = {
    w: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
    b: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
  };

  const ROOK_DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const BISHOP_DIRS = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
  const KNIGHT_DELTAS = [
    [1, 2],
    [2, 1],
    [-1, 2],
    [-2, 1],
    [1, -2],
    [2, -1],
    [-1, -2],
    [-2, -1],
  ];

  // Einfache Stellungstabellen (weiße Perspektive, Zeile 0 = Reihe 8). Für
  // Schwarz wird die Zeile gespiegelt (7-r). Nur Bauer/Springer, das reicht
  // für ein spürbar "vernünftiges" Positionsspiel ohne den Code aufzublähen.
  const PAWN_PST = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const KNIGHT_PST = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ];

  const setupScreen = document.getElementById("setup-screen");
  const playScreen = document.getElementById("play-screen");
  const resultScreen = document.getElementById("result-screen");
  const statusEl = document.getElementById("chess-status");
  const boardEl = document.getElementById("chess-board");

  let gameState = null; // { state, mode, settings, selected, lastMove, finished, aiThinking }
  let lastSelection = null;

  function showScreen(screen) {
    [setupScreen, playScreen, resultScreen].forEach((s) => {
      s.hidden = s !== screen;
    });
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function createInitialBoard() {
    const board = Array.from({ length: 8 }, () => new Array(8).fill(null));
    const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    for (let c = 0; c < 8; c++) {
      board[0][c] = { type: backRank[c], color: "b" };
      board[1][c] = { type: "P", color: "b" };
      board[6][c] = { type: "P", color: "w" };
      board[7][c] = { type: backRank[c], color: "w" };
    }
    return board;
  }

  function createInitialState() {
    return {
      board: createInitialBoard(),
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassantTarget: null,
    };
  }

  // ---- Angriffserkennung ----

  function isSquareAttacked(board, row, col, byColor) {
    const pawnDir = byColor === "w" ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = row + pawnDir;
      const pc = col + dc;
      if (inBounds(pr, pc)) {
        const p = board[pr][pc];
        if (p && p.color === byColor && p.type === "P") return true;
      }
    }

    for (const [dr, dc] of KNIGHT_DELTAS) {
      const nr = row + dr;
      const nc = col + dc;
      if (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.color === byColor && p.type === "N") return true;
      }
    }

    for (const [dr, dc] of QUEEN_DIRS) {
      const nr = row + dr;
      const nc = col + dc;
      if (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.color === byColor && p.type === "K") return true;
      }
    }

    for (const [dr, dc] of ROOK_DIRS) {
      let nr = row + dr;
      let nc = col + dc;
      while (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p) {
          if (p.color === byColor && (p.type === "R" || p.type === "Q")) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    for (const [dr, dc] of BISHOP_DIRS) {
      let nr = row + dr;
      let nc = col + dc;
      while (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p) {
          if (p.color === byColor && (p.type === "B" || p.type === "Q")) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

    return false;
  }

  function findKing(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === "K" && p.color === color) return { row: r, col: c };
      }
    }
    return null;
  }

  function isKingInCheck(board, color) {
    const kingPos = findKing(board, color);
    if (!kingPos) return false;
    return isSquareAttacked(board, kingPos.row, kingPos.col, color === "w" ? "b" : "w");
  }

  // ---- Zuggenerierung (pseudo-legal) ----

  function addStepMoves(board, r, c, piece, deltas, moves) {
    for (const [dr, dc] of deltas) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (target && target.color === piece.color) continue;
      moves.push({
        from: { row: r, col: c },
        to: { row: nr, col: nc },
        piece,
        captured: target || null,
        promotion: null,
        isEnPassant: false,
        isCastle: null,
      });
    }
  }

  function addSlidingMoves(board, r, c, piece, dirs, moves) {
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (target) {
          if (target.color !== piece.color) {
            moves.push({
              from: { row: r, col: c },
              to: { row: nr, col: nc },
              piece,
              captured: target,
              promotion: null,
              isEnPassant: false,
              isCastle: null,
            });
          }
          break;
        }
        moves.push({
          from: { row: r, col: c },
          to: { row: nr, col: nc },
          piece,
          captured: null,
          promotion: null,
          isEnPassant: false,
          isCastle: null,
        });
        nr += dr;
        nc += dc;
      }
    }
  }

  function pushPawnMove(moves, piece, fr, fc, tr, tc, captured, promotionRow) {
    moves.push({
      from: { row: fr, col: fc },
      to: { row: tr, col: tc },
      piece,
      captured: captured || null,
      promotion: tr === promotionRow ? "Q" : null,
      isEnPassant: false,
      isCastle: null,
    });
  }

  function addPawnMoves(state, r, c, piece, moves) {
    const { board } = state;
    const dir = piece.color === "w" ? -1 : 1;
    const startRow = piece.color === "w" ? 6 : 1;
    const promotionRow = piece.color === "w" ? 0 : 7;

    const oneRow = r + dir;
    if (inBounds(oneRow, c) && !board[oneRow][c]) {
      pushPawnMove(moves, piece, r, c, oneRow, c, null, promotionRow);
      const twoRow = r + dir * 2;
      if (r === startRow && !board[twoRow][c]) {
        moves.push({
          from: { row: r, col: c },
          to: { row: twoRow, col: c },
          piece,
          captured: null,
          promotion: null,
          isEnPassant: false,
          isCastle: null,
        });
      }
    }

    for (const dc of [-1, 1]) {
      const nr = oneRow;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (target && target.color !== piece.color) {
        pushPawnMove(moves, piece, r, c, nr, nc, target, promotionRow);
      } else if (!target && state.enPassantTarget && state.enPassantTarget.row === nr && state.enPassantTarget.col === nc) {
        moves.push({
          from: { row: r, col: c },
          to: { row: nr, col: nc },
          piece,
          captured: board[r][nc],
          promotion: null,
          isEnPassant: true,
          isCastle: null,
        });
      }
    }
  }

  function addCastleMoves(state, r, c, piece, moves) {
    const { board, castling } = state;
    const color = piece.color;
    const opponent = color === "w" ? "b" : "w";
    if (isSquareAttacked(board, r, c, opponent)) return;

    const canKingside = color === "w" ? castling.wK : castling.bK;
    const canQueenside = color === "w" ? castling.wQ : castling.bQ;

    if (
      canKingside &&
      !board[r][5] &&
      !board[r][6] &&
      board[r][7] &&
      board[r][7].type === "R" &&
      board[r][7].color === color &&
      !isSquareAttacked(board, r, 5, opponent) &&
      !isSquareAttacked(board, r, 6, opponent)
    ) {
      moves.push({
        from: { row: r, col: c },
        to: { row: r, col: 6 },
        piece,
        captured: null,
        promotion: null,
        isEnPassant: false,
        isCastle: "K",
      });
    }

    if (
      canQueenside &&
      !board[r][1] &&
      !board[r][2] &&
      !board[r][3] &&
      board[r][0] &&
      board[r][0].type === "R" &&
      board[r][0].color === color &&
      !isSquareAttacked(board, r, 3, opponent) &&
      !isSquareAttacked(board, r, 2, opponent)
    ) {
      moves.push({
        from: { row: r, col: c },
        to: { row: r, col: 2 },
        piece,
        captured: null,
        promotion: null,
        isEnPassant: false,
        isCastle: "Q",
      });
    }
  }

  function generatePseudoMoves(state, color) {
    const { board } = state;
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== color) continue;

        if (piece.type === "P") addPawnMoves(state, r, c, piece, moves);
        else if (piece.type === "N") addStepMoves(board, r, c, piece, KNIGHT_DELTAS, moves);
        else if (piece.type === "B") addSlidingMoves(board, r, c, piece, BISHOP_DIRS, moves);
        else if (piece.type === "R") addSlidingMoves(board, r, c, piece, ROOK_DIRS, moves);
        else if (piece.type === "Q") addSlidingMoves(board, r, c, piece, QUEEN_DIRS, moves);
        else if (piece.type === "K") {
          addStepMoves(board, r, c, piece, QUEEN_DIRS, moves);
          addCastleMoves(state, r, c, piece, moves);
        }
      }
    }
    return moves;
  }

  function getLegalMoves(state, color) {
    const pseudo = generatePseudoMoves(state, color);
    const legal = [];
    const opponent = color === "w" ? "b" : "w";
    for (const move of pseudo) {
      const next = makeMove(state, move);
      const kingPos = findKing(next.board, color);
      if (kingPos && !isSquareAttacked(next.board, kingPos.row, kingPos.col, opponent)) {
        legal.push(move);
      }
    }
    return legal;
  }

  // ---- Zug ausführen (rein, liefert neuen State) ----

  function makeMove(state, move) {
    const board = cloneBoard(state.board);
    const piece = move.piece;

    board[move.from.row][move.from.col] = null;
    if (move.isEnPassant) {
      board[move.from.row][move.to.col] = null;
    }

    board[move.to.row][move.to.col] = move.promotion ? { type: move.promotion, color: piece.color } : piece;

    if (move.isCastle) {
      const row = move.from.row;
      if (move.isCastle === "K") {
        board[row][5] = board[row][7];
        board[row][7] = null;
      } else {
        board[row][3] = board[row][0];
        board[row][0] = null;
      }
    }

    const castling = { ...state.castling };
    if (piece.type === "K") {
      if (piece.color === "w") {
        castling.wK = false;
        castling.wQ = false;
      } else {
        castling.bK = false;
        castling.bQ = false;
      }
    }
    const loseRookRight = (row, col) => {
      if (row === 7 && col === 0) castling.wQ = false;
      if (row === 7 && col === 7) castling.wK = false;
      if (row === 0 && col === 0) castling.bQ = false;
      if (row === 0 && col === 7) castling.bK = false;
    };
    loseRookRight(move.from.row, move.from.col);
    loseRookRight(move.to.row, move.to.col);

    let enPassantTarget = null;
    if (piece.type === "P" && Math.abs(move.to.row - move.from.row) === 2) {
      enPassantTarget = { row: (move.to.row + move.from.row) / 2, col: move.from.col };
    }

    return {
      board,
      turn: state.turn === "w" ? "b" : "w",
      castling,
      enPassantTarget,
    };
  }

  // ---- Bewertung & KI ----

  function evaluate(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        let value = PIECE_VALUES[piece.type];
        if (piece.type === "P") {
          value += piece.color === "w" ? PAWN_PST[r][c] : PAWN_PST[7 - r][c];
        } else if (piece.type === "N") {
          value += piece.color === "w" ? KNIGHT_PST[r][c] : KNIGHT_PST[7 - r][c];
        }
        score += piece.color === "w" ? value : -value;
      }
    }
    return score;
  }

  function moveOrderScore(move) {
    let s = 0;
    if (move.captured) s += 10 + PIECE_VALUES[move.captured.type] / 100;
    if (move.promotion) s += 8;
    if (move.isCastle) s += 2;
    return s;
  }

  // Zeitbudget für die iterative Tiefensuche (siehe findBestMoveWithinTime).
  // Ein zu tiefer Minimax-Baum kann sonst mehrere Sekunden blockieren - der
  // Knotenzähler wird nur alle 1024 Aufrufe geprüft, damit performance.now()
  // nicht selbst zur Bremse wird.
  let searchDeadline = 0;
  let nodeCount = 0;
  function SearchTimeout() {}
  SearchTimeout.prototype = Object.create(Error.prototype);

  function negamax(state, depth, alpha, beta, color) {
    nodeCount++;
    if ((nodeCount & 1023) === 0 && performance.now() > searchDeadline) {
      throw new SearchTimeout();
    }

    if (depth === 0) {
      return evaluate(state.board) * (color === "w" ? 1 : -1);
    }

    const legalMoves = getLegalMoves(state, color);
    if (legalMoves.length === 0) {
      if (isKingInCheck(state.board, color)) return -100000 - depth;
      return 0;
    }

    legalMoves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));

    let best = -Infinity;
    const nextColor = color === "w" ? "b" : "w";
    for (const move of legalMoves) {
      const next = makeMove(state, move);
      const score = -negamax(next, depth - 1, -beta, -alpha, nextColor);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function findBestMove(state, color, depth) {
    const legalMoves = getLegalMoves(state, color);
    if (legalMoves.length === 0) return null;
    legalMoves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));

    let best = legalMoves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    const nextColor = color === "w" ? "b" : "w";

    for (const move of legalMoves) {
      const next = makeMove(state, move);
      const score = -negamax(next, depth - 1, -beta, -alpha, nextColor);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
      if (bestScore > alpha) alpha = bestScore;
    }
    return best;
  }

  /**
   * Iterative Tiefensuche: probiert Tiefe 1, 2, 3, ... bis maxDepth, bricht
   * aber ab, sobald timeLimitMs überschritten ist. Eine begonnene, aber
   * durch das Zeitlimit abgebrochene Tiefe wird verworfen (SearchTimeout) -
   * zurückgegeben wird immer das Ergebnis der letzten VOLLSTÄNDIG
   * durchsuchten Tiefe. So bleibt die Rechenzeit auch in komplexen
   * Stellungen zuverlässig begrenzt, statt bei fester Tiefe unvorhersehbar
   * lange zu blockieren.
   */
  function findBestMoveWithinTime(state, color, maxDepth, timeLimitMs) {
    const legalMoves = getLegalMoves(state, color);
    if (legalMoves.length === 0) return null;

    searchDeadline = performance.now() + timeLimitMs;
    nodeCount = 0;

    let best = legalMoves[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        const result = findBestMove(state, color, depth);
        if (result) best = result;
      } catch (err) {
        if (err instanceof SearchTimeout) break;
        throw err;
      }
      if (performance.now() > searchDeadline) break;
    }
    return best;
  }

  function chooseAiMove(state, color, settings) {
    const legalMoves = getLegalMoves(state, color);
    if (legalMoves.length === 0) return null;
    if (Math.random() < settings.randomness) {
      return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }
    return findBestMoveWithinTime(state, color, settings.maxDepth, settings.timeLimit) || legalMoves[0];
  }

  // ---- Spielsteuerung ----

  function legalMovesFromSquare(state, square) {
    return getLegalMoves(state, state.turn).filter(
      (m) => m.from.row === square.row && m.from.col === square.col
    );
  }

  function handleSquareClick(row, col) {
    if (!gameState || gameState.finished || gameState.aiThinking) return;
    const { state } = gameState;
    if (gameState.mode === "bot" && state.turn === "b") return;

    const piece = state.board[row][col];

    if (gameState.selected) {
      const moves = legalMovesFromSquare(state, gameState.selected);
      const move = moves.find((m) => m.to.row === row && m.to.col === col);
      if (move) {
        applyMove(move);
        return;
      }
      gameState.selected = piece && piece.color === state.turn ? { row, col } : null;
      render();
      return;
    }

    if (piece && piece.color === state.turn) {
      gameState.selected = { row, col };
      render();
    }
  }

  function applyMove(move) {
    gameState.state = makeMove(gameState.state, move);
    gameState.lastMove = move;
    gameState.selected = null;

    if (checkGameEnd()) return;
    render();

    if (gameState.mode === "bot" && gameState.state.turn === "b") {
      gameState.aiThinking = true;
      render();
      setTimeout(runAiMove, AI_THINK_DELAY);
    }
  }

  function runAiMove() {
    if (!gameState || gameState.finished) return;
    const move = chooseAiMove(gameState.state, "b", gameState.settings);
    gameState.aiThinking = false;
    if (!move) {
      render();
      return;
    }
    gameState.state = makeMove(gameState.state, move);
    gameState.lastMove = move;
    if (checkGameEnd()) return;
    render();
  }

  function checkGameEnd() {
    const { state } = gameState;
    const legalMoves = getLegalMoves(state, state.turn);
    if (legalMoves.length > 0) return false;

    gameState.finished = true;
    render();

    if (isKingInCheck(state.board, state.turn)) {
      endGame(state.turn === "w" ? "b" : "w", "checkmate");
    } else {
      endGame(null, "stalemate");
    }
    return true;
  }

  function endGame(winnerColor, reason) {
    let title;
    let message;
    if (reason === "stalemate") {
      title = "🤝 Unentschieden!";
      message = "Patt – keine gültigen Züge mehr, aber kein Schach.";
    } else {
      const label =
        gameState.mode === "bot"
          ? winnerColor === "w"
            ? "Du"
            : "Der Bot"
          : winnerColor === "w"
            ? "Weiß"
            : "Schwarz";
      title = `🏆 ${label} gewinnt!`;
      message = "Schachmatt!";
    }

    PixelPortGameScreens.renderResult(resultScreen, {
      title,
      message,
      backHref: CATEGORY_URL,
      onRestart: () => startGame(lastSelection),
    });
    showScreen(resultScreen);
  }

  function updateStatus() {
    if (gameState.finished) return;
    if (gameState.aiThinking) {
      statusEl.textContent = "🤔 Der Bot denkt nach ...";
      return;
    }
    const { state, mode } = gameState;
    const inCheck = isKingInCheck(state.board, state.turn);
    const turnLabel =
      mode === "bot"
        ? state.turn === "w"
          ? "Du bist am Zug"
          : "Bot ist am Zug"
        : state.turn === "w"
          ? "Weiß ist am Zug"
          : "Schwarz ist am Zug";
    statusEl.textContent = inCheck ? `${turnLabel} – Schach!` : turnLabel;
  }

  function render() {
    if (!gameState) return;
    updateStatus();

    const { state, selected, mode, aiThinking, finished } = gameState;
    const inCheck = isKingInCheck(state.board, state.turn);
    const checkSquare = inCheck ? findKing(state.board, state.turn) : null;
    const legalTargets = selected ? legalMovesFromSquare(state, selected) : [];

    boardEl.innerHTML = "";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const square = document.createElement("div");
        const isLight = (r + c) % 2 === 0;
        square.className = "chess-square " + (isLight ? "chess-square--light" : "chess-square--dark");

        if (selected && selected.row === r && selected.col === c) {
          square.classList.add("is-selected");
        } else if (checkSquare && checkSquare.row === r && checkSquare.col === c) {
          square.classList.add("is-check");
        } else if (
          gameState.lastMove &&
          ((gameState.lastMove.from.row === r && gameState.lastMove.from.col === c) ||
            (gameState.lastMove.to.row === r && gameState.lastMove.to.col === c))
        ) {
          square.classList.add("is-last-move");
        }

        const targetMove = legalTargets.find((m) => m.to.row === r && m.to.col === c);
        const piece = state.board[r][c];

        if (targetMove) {
          square.classList.add("is-target", "is-clickable");
          if (piece || targetMove.isEnPassant) square.classList.add("has-piece");
        }

        const canSelect =
          !finished && !aiThinking && piece && piece.color === state.turn && !(mode === "bot" && state.turn === "b");
        if (canSelect) square.classList.add("is-clickable");

        if (piece) {
          const span = document.createElement("span");
          span.className = "chess-piece chess-piece--" + (piece.color === "w" ? "white" : "black");
          span.textContent = PIECE_GLYPHS[piece.color][piece.type];
          square.appendChild(span);
        }

        square.addEventListener("click", () => handleSquareClick(r, c));
        boardEl.appendChild(square);
      }
    }
  }

  function startGame(selection) {
    lastSelection = selection;
    gameState = {
      state: createInitialState(),
      mode: selection.mode.id,
      settings: DIFFICULTY_SETTINGS[selection.difficulty.id],
      selected: null,
      lastMove: null,
      finished: false,
      aiThinking: false,
    };
    showScreen(playScreen);
    render();
  }

  function initSetup() {
    PixelPortGameScreens.renderSetup(setupScreen, {
      gameName: "Schach",
      icon: "♟️",
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
