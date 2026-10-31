// Expectiminimax for Crab Chess. Every capture is settled by a minigame, so a capture is a
// chance node: half the time it succeeds, half the time the attacker is removed instead
// (see resolveCapture in game.js). Quiet moves are searched with plain alpha-beta negamax.
import { Chess } from 'chess.js';
import { resolveCapture } from '../game.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;
const INF = MATE * 2;
const KING_EXPOSED = 1000; // the exposed king's last-chance fight is a coin flip for the game
const WIN_CHANCE = 0.5;

// Positional bonus: pawns advance, pieces centralise, rooks like the 7th, the king stays home.
function bonus(type, color, square) {
  const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
  const adv = color === 'w' ? rank : 7 - rank;
  const centre = 3.5 - Math.max(Math.abs(file - 3.5), Math.abs(rank - 3.5)); // 0 (edge) .. 3 (centre)
  switch (type) {
    case 'p': return file >= 2 && file <= 5 ? adv * 8 + centre * 4 : adv * 3;
    case 'n': return centre * 10 - 15;
    case 'b': return centre * 6;
    case 'r': return adv === 6 ? 15 : 0;
    case 'q': return centre * 3;
    default: return adv === 0 ? 10 : -adv * 8;
  }
}

// Static score from White's point of view.
export function evaluate(chess) {
  let s = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue;
      const v = VALUE[p.type] + bonus(p.type, p.color, p.square);
      s += p.color === 'w' ? v : -v;
    }
  }
  return s;
}
const forSideToMove = (chess) => (chess.turn() === 'w' ? 1 : -1) * evaluate(chess);

// Legal moves under the simplified rules: no castling, no en passant, auto-queen.
function moves(chess) {
  return chess
    .moves({ verbose: true })
    .filter((m) => !m.isEnPassant() && !m.isKingsideCastle() && !m.isQueensideCastle() && (!m.promotion || m.promotion === 'q'));
}

// Promising captures first (gain if won minus loss if lost), then quiet moves.
const orderKey = (m) => (m.captured ? 10000 + VALUE[m.captured] - VALUE[m.piece] : 0) + (m.promotion ? 800 : 0);
const order = (list) => list.sort((a, b) => orderKey(b) - orderKey(a));

// Thrown to unwind the search when the time budget runs out.
const TIMEOUT = Symbol('timeout');
let deadline = Infinity, nodes = 0;

function negamax(chess, depth, alpha, beta, ply) {
  if ((++nodes & 255) === 0 && Date.now() > deadline) throw TIMEOUT;
  if (depth === 0) {
    if (chess.inCheck() && chess.isCheckmate()) return -MATE + ply;
    return forSideToMove(chess);
  }
  const list = moves(chess);
  if (!list.length) return chess.inCheck() ? -MATE + ply : 0;
  let best = -INF;
  for (const m of order(list)) {
    best = Math.max(best, moveValue(chess, m, depth, alpha, beta, ply));
    alpha = Math.max(alpha, best);
    if (alpha >= beta) break;
  }
  return best;
}

// Value of playing `m` for the side to move.
function moveValue(chess, m, depth, alpha, beta, ply) {
  if (!m.captured) {
    chess.move(m);
    const v = -negamax(chess, depth - 1, -beta, -alpha, ply + 1);
    chess.undo();
    return v;
  }
  // Chance node: both outcomes need exact values, so they get a full window.
  chess.move(m);
  const won = -negamax(chess, depth - 1, -INF, INF, ply + 1);
  chess.undo();
  return WIN_CHANCE * won + (1 - WIN_CHANCE) * lostValue(chess, m, depth, ply);
}

// The capture failed: the attacker is removed and the turn passes.
function lostValue(chess, m, depth, ply) {
  if (m.piece === 'k') return -MATE + ply; // a king that loses its fight dies
  const c = new Chess(chess.fen());
  const r = resolveCapture(c, m.from, m.to, false);
  if (r.status === 'kingExposed') return -forSideToMove(c) - KING_EXPOSED;
  return -negamax(c, depth - 1, -INF, INF, ply + 1);
}

// Score every root move at `depth`, best first.
function scoreRoot(chess, list, depth, exact) {
  let alpha = -INF;
  const scored = list.map((m) => {
    const v = moveValue(chess, m, depth, exact ? -INF : alpha, INF, 0);
    alpha = Math.max(alpha, v);
    return { m, v };
  });
  return scored.sort((a, b) => b.v - a.v);
}

/**
 * Pick a move for the side to move in `fen`. Returns { from, to } or null if there is none.
 * Deepens one ply at a time up to `depth`; if `timeMs` runs out, the last finished depth is used.
 * With probability `noise`, plays one of the three best moves at random instead of the best.
 */
export function chooseMove(fen, { depth = 2, noise = 0, timeMs = Infinity, random = Math.random } = {}) {
  const chess = new Chess(fen);
  const list = moves(chess);
  if (!list.length) return null;
  // Shuffle first so equal moves are chosen at random (the sort below is stable).
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  order(list);
  const stop = Date.now() + timeMs;
  let scored = null;
  for (let d = 1; d <= depth; d++) {
    deadline = d === 1 ? Infinity : stop; // depth 1 always finishes, so there is always a move
    try {
      // With noise we need exact scores for the runners-up, so skip root pruning.
      // The previous depth's ranking is the move order for this one.
      scored = scoreRoot(chess, scored ? scored.map((x) => x.m) : list, d, noise > 0);
    } catch (err) {
      if (err !== TIMEOUT) throw err;
      break;
    }
  }
  deadline = Infinity;
  const pick = noise && random() < noise ? scored[Math.floor(random() * Math.min(3, scored.length))] : scored[0];
  return { from: pick.m.from, to: pick.m.to };
}
