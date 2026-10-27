const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';

// Renders chess.board() into `el`. Calls onSquare(square) on clicks.
export function renderBoard(el, chess, { selected, targets = [], onSquare }) {
  el.innerHTML = '';
  const board = chess.board();
  const checkSq = chess.inCheck() ? findKingSq(board, chess.turn()) : null;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
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
