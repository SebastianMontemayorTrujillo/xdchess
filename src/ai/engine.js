// Small, fast move generator used only by the AI search.
// chess.js builds SAN for every move and is ~100x too slow for minimax, so the
// search works on this lightweight representation instead. It follows the same
// simplified rules as game.js: no castling, no en passant, auto-queen.
//
// Squares are 0..63 (index = row * 8 + col, row 0 = rank 8), matching chess.board().
// board[sq] is a FEN char ('P', 'n', ...) or null. Uppercase = white.

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
export const typeOf = (p) => p.toLowerCase();
const other = (c) => (c === 'w' ? 'b' : 'w');
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export const squareName = (s) => 'abcdefgh'[s & 7] + (8 - (s >> 3));
export const squareIndex = (name) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);

// Position: { board, turn }.
export function fromFEN(fen) {
  const [placement, turn] = fen.split(' ');
  const board = new Array(64).fill(null);
  placement.split('/').forEach((rank, row) => {
    let col = 0;
    for (const ch of rank) {
      if (/\d/.test(ch)) col += Number(ch);
      else board[row * 8 + col++] = ch;
    }
  });
  return { board, turn };
}

export function findKing(board, color) {
  const k = color === 'w' ? 'K' : 'k';
  return board.indexOf(k);
}

// Is square `s` attacked by `by`?
export function isAttacked(board, s, by) {
  const r = s >> 3, c = s & 7;
  const own = (p, t) => p && colorOf(p) === by && typeOf(p) === t;

  const pr = by === 'w' ? r + 1 : r - 1; // white pawns attack upward, so they sit one row below
  for (const dc of [-1, 1]) if (inside(pr, c + dc) && own(board[pr * 8 + c + dc], 'p')) return true;
  for (const [dr, dc] of KNIGHT) if (inside(r + dr, c + dc) && own(board[(r + dr) * 8 + c + dc], 'n')) return true;
  for (const [dr, dc] of KING) if (inside(r + dr, c + dc) && own(board[(r + dr) * 8 + c + dc], 'k')) return true;
  return slider(board, r, c, by, ROOK_DIRS, 'r') || slider(board, r, c, by, BISHOP_DIRS, 'b');
}

function slider(board, r, c, by, dirs, t) {
  for (const [dr, dc] of dirs) {
    for (let rr = r + dr, cc = c + dc; inside(rr, cc); rr += dr, cc += dc) {
      const p = board[rr * 8 + cc];
      if (!p) continue;
      if (colorOf(p) === by && (typeOf(p) === t || typeOf(p) === 'q')) return true;
      break;
    }
  }
  return false;
}

export function inCheck(pos, color = pos.turn) {
  return isAttacked(pos.board, findKing(pos.board, color), other(color));
}

// Legal moves: { from, to, piece, captured, promotion }.
export function legalMoves(pos) {
  const { board, turn } = pos;
  const moves = [];
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p && colorOf(p) === turn) pieceMoves(board, s, p, moves);
  }
  return moves.filter((m) => {
    const next = applyToBoard(board, m);
    return !isAttacked(next, findKing(next, turn), other(turn));
  });
}

function pieceMoves(board, s, p, moves) {
  const r = s >> 3, c = s & 7;
  const color = colorOf(p);
  const add = (to) => {
    const target = board[to];
    if (target && colorOf(target) === color) return false;
    moves.push({ from: s, to, piece: p, captured: target, promotion: null });
    return !target;
  };

  switch (typeOf(p)) {
    case 'p': {
      const dir = color === 'w' ? -1 : 1;
      const lastRow = color === 'w' ? 0 : 7;
      const push = (to, captured) => moves.push({
        from: s, to, piece: p, captured, promotion: (to >> 3) === lastRow ? 'q' : null,
      });
      if (inside(r + dir, c) && !board[(r + dir) * 8 + c]) {
        push((r + dir) * 8 + c, null);
        const startRow = color === 'w' ? 6 : 1;
        if (r === startRow && !board[(r + 2 * dir) * 8 + c]) push((r + 2 * dir) * 8 + c, null);
      }
      for (const dc of [-1, 1]) {
        if (!inside(r + dir, c + dc)) continue;
        const target = board[(r + dir) * 8 + c + dc];
        if (target && colorOf(target) !== color) push((r + dir) * 8 + c + dc, target);
      }
      break;
    }
    case 'n':
      for (const [dr, dc] of KNIGHT) if (inside(r + dr, c + dc)) add((r + dr) * 8 + c + dc);
      break;
    case 'k':
      for (const [dr, dc] of KING) if (inside(r + dr, c + dc)) add((r + dr) * 8 + c + dc);
      break;
    default: {
      const t = typeOf(p);
      const dirs = t === 'r' ? ROOK_DIRS : t === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [dr, dc] of dirs) {
        for (let rr = r + dr, cc = c + dc; inside(rr, cc); rr += dr, cc += dc) {
          if (!add(rr * 8 + cc)) break;
        }
      }
    }
  }
}

function applyToBoard(board, m) {
  const next = board.slice();
  next[m.from] = null;
  next[m.to] = m.promotion ? (colorOf(m.piece) === 'w' ? 'Q' : 'q') : m.piece;
  return next;
}

// The capture or move succeeds.
export function makeMove(pos, m) {
  return { board: applyToBoard(pos.board, m), turn: other(pos.turn) };
}

// The attacker lost its minigame: it is removed and the turn passes (see resolveCapture).
export function removeAttacker(pos, m) {
  const board = pos.board.slice();
  board[m.from] = null;
  return { board, turn: other(pos.turn) };
}
