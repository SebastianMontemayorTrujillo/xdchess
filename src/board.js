export const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';

// Renders chess.board() into `el`. Calls onSquare(square) on clicks.
// `flipped` shows the board from Black's side.
export function renderBoard(el, chess, { selected, targets = [], onSquare, flipped = false }) {
  el.innerHTML = '';
  const board = chess.board();
  const checkSq = chess.inCheck() ? findKingSq(board, chess.turn()) : null;
  const order = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const r of order) {
    for (const f of order) {
      const square = FILES[f] + (8 - r);
      const piece = board[r][f];
      const div = document.createElement('div');
      div.className = 'sq ' + ((r + f) % 2 ? 'dark' : 'light');
      if (piece) {
        div.textContent = GLYPH[piece.type];
        div.classList.add(piece.color === 'w' ? 'pw' : 'pb');
      }
      if (square === selected) div.classList.add('selected');
      const t = targets.find((m) => m.to === square);
      if (t) div.classList.add(t.captured ? 'capture' : 'target');
      if (square === checkSq) div.classList.add('check');
      div.addEventListener('click', () => onSquare(square));
      el.appendChild(div);
    }
  }
}

function findKingSq(board, color) {
  for (const row of board) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

export const pieceName = (p) => `${p.color === 'w' ? 'White' : 'Black'} ${GLYPH[p.type]}`;
