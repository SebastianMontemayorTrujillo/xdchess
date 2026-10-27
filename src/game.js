import { Chess } from 'chess.js';

// Simplified rules: no castling, no en passant, auto-queen,
// no repetition / fifty-move adjudication.
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1';

const other = (c) => (c === 'w' ? 'b' : 'w');

export function newGame(fen = START_FEN) {
  const chess = new Chess();
  safeLoad(chess, fen);
  sanitize(chess);
  return chess;
}

// Load a FEN; on failure restore the previous position and rethrow.
function safeLoad(chess, fen) {
  const prev = chess.fen();
  try {
    chess.load(fen);
  } catch (err) {
    chess.load(prev);
    throw err;
  }
}

// Strip castling rights and en-passant square from the current position.
export function sanitize(chess) {
  const parts = chess.fen().split(' ');
  if (parts[2] === '-' && parts[3] === '-') return;
  parts[2] = '-';
  parts[3] = '-';
  safeLoad(chess, parts.join(' '));
}

export function legalMoves(chess, square) {
  return chess
    .moves({ square, verbose: true })
    .filter((m) => !m.isEnPassant() && !m.isKingsideCastle() && !m.isQueensideCastle());
}

export function isCapture(move) {
  return Boolean(move.captured);
}

export function findKing(chess, color) {
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type === 'k' && sq.color === color) return sq.square;
    }
  }
  return null;
}

// Squares of `color`'s pieces currently attacking `color`'s opponent king.
function checkersOf(chess, kingColor) {
  const king = findKing(chess, kingColor);
  return king ? chess.attackers(king, other(kingColor)) : [];
}

/**
 * Resolve an attempted capture.
 * Returns:
 *   { status: 'ok' }
 *   { status: 'kingDied', winner }            attacking king lost its fight
 *   { status: 'kingExposed', king, checkers } defender won but the attacker's
 *       king is now attacked; caller must run a last-chance fight.
 */
export function resolveCapture(chess, from, to, attackerWon) {
  const piece = chess.get(from);
  if (!piece) throw new Error(`No piece on ${from}`);
  const attacker = piece.color;
  const defender = other(attacker);

  if (attackerWon) {
    chess.move({ from, to, promotion: 'q' });
    sanitize(chess);
    return { status: 'ok' };
  }

  if (piece.type === 'k') return { status: 'kingDied', winner: defender };

  chess.remove(from);
  const parts = chess.fen().split(' ');
  parts[1] = defender;
  parts[2] = '-';
  parts[3] = '-';
  parts[4] = '0';
  if (attacker === 'b') parts[5] = String(Number(parts[5]) + 1);
  safeLoad(chess, parts.join(' '));

  const checkers = checkersOf(chess, attacker);
  if (checkers.length) return { status: 'kingExposed', king: findKing(chess, attacker), checkers };
  return { status: 'ok' };
}

/**
 * Last-chance fight for a king exposed by a defender victory.
 * kingWon removes the checking piece; otherwise the king dies.
 */
export function resolveLastChance(chess, checkerSquare, kingWon) {
  const checker = chess.get(checkerSquare);
  if (!checker) throw new Error(`No piece on ${checkerSquare}`);
  const kingColor = other(checker.color);
  if (!kingWon) return { status: 'kingDied', winner: checker.color };

  chess.remove(checkerSquare);
  safeLoad(chess, chess.fen());
  const checkers = checkersOf(chess, kingColor);
  if (checkers.length) return { status: 'kingExposed', king: findKing(chess, kingColor), checkers };
  return { status: 'ok' };
}

// Game status using only the simplified end conditions.
export function gameStatus(chess) {
  if (chess.isCheckmate()) return { over: true, winner: other(chess.turn()), reason: 'checkmate' };
  if (chess.isStalemate()) return { over: true, winner: null, reason: 'stalemate' };
  return { over: false, check: chess.inCheck() };
}
