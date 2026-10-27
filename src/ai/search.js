import {
  fromFEN, legalMoves, makeMove, removeAttacker, inCheck, typeOf, colorOf, squareName,
} from './engine.js';

// Minimax (negamax form) with alpha-beta pruning.
// Every capture is a gamble settled by a minigame, so captures are chance nodes:
//   value = P(attacker wins) * value(capture happens) + P(attacker loses) * value(attacker removed)
// which mirrors resolveCapture / resolveLastChance in game.js.

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
export const MATE = 100000;

// Piece-square tables from White's point of view (row 0 = rank 8).
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  // Kings are fragile here (a lost fight ends the game), so keep them home.
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

// Score from the side to move's point of view.
export function evaluate(pos) {
  let score = 0;
  for (let s = 0; s < 64; s++) {
    const p = pos.board[s];
    if (!p) continue;
    const t = typeOf(p);
    const white = colorOf(p) === 'w';
    const v = VALUE[t] + PST[t][white ? s : (7 - (s >> 3)) * 8 + (s & 7)];
    score += white ? v : -v;
  }
  return pos.turn === 'w' ? score : -score;
}

// Captures first, most valuable victim / least valuable attacker first.
function order(moves) {
  const key = (m) => (m.captured ? 10 * VALUE[typeOf(m.captured)] - VALUE[typeOf(m.piece)] + 1000 : 0);
  return moves.sort((a, b) => key(b) - key(a));
}

function negamax(pos, depth, alpha, beta, ply, ctx) {
  ctx.nodes++;
  if (depth === 0) return evaluate(pos);
  const moves = legalMoves(pos);
  if (moves.length === 0) return inCheck(pos) ? -(MATE - ply) : 0; // checkmate / stalemate

  let best = -Infinity;
  for (const m of order(moves)) {
    const v = m.captured
      ? captureValue(pos, m, depth, ply, ctx)
      : -negamax(makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// Expected value of a capture for the side to move.
function captureValue(pos, m, depth, ply, ctx) {
  const me = pos.turn;
  const p = ctx.pWin[me];
  const lostGame = -(MATE - ply);

  const won = -negamax(makeMove(pos, m), depth - 1, -Infinity, Infinity, ply + 1, ctx);

  let lost;
  if (typeOf(m.piece) === 'k') {
    lost = lostGame; // an attacking king that loses dies
  } else {
    const after = removeAttacker(pos, m);
    if (inCheck(after, me)) {
      // Our king is exposed: last-chance fight, our king vs the checker.
      lost = p * -evaluate(after) + (1 - p) * lostGame;
    } else {
      lost = -negamax(after, depth - 1, -Infinity, Infinity, ply + 1, ctx);
    }
  }
  return p * won + (1 - p) * lost;
}

/**
 * Pick a move for the side to move in `fen`.
 * pWin: { w, b } chance each color wins a minigame (sums to 1).
 * Returns { from, to, promotion, score, nodes } with algebraic squares, or null if no moves.
 */
export function chooseMove(fen, { depth = 3, pWin = { w: 0.5, b: 0.5 }, noise = 8 } = {}) {
  const pos = fromFEN(fen);
  const ctx = { nodes: 0, pWin };
  let best = null;
  let bestScore = -Infinity;

  for (const m of order(legalMoves(pos))) {
    const raw = m.captured
      ? captureValue(pos, m, depth, 0, ctx)
      : -negamax(makeMove(pos, m), depth - 1, -Infinity, Infinity, 1, ctx);
    const score = raw + Math.random() * noise; // small noise so games don't repeat
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best) return null;
  return {
    from: squareName(best.from),
    to: squareName(best.to),
    promotion: best.promotion ?? undefined,
    score: Math.round(bestScore),
    nodes: ctx.nodes,
  };
}
