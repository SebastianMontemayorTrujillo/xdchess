// Piece icons shared by the board and the minigames.
export const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

export const pieceName = (p) => `${p.color === 'w' ? 'White' : 'Black'} ${GLYPH[p.type]}`;

// A piece icon for minigame overlays, styled like the board (.pw / .pb) and readable on dark backgrounds.
export const pieceHTML = (color, type) =>
  `<span class="fighter ${color === 'w' ? 'pw' : 'pb'}">${GLYPH[type]}</span>`;

// Minigames get { w: type, b: type }; fall back to pawns if a minigame is run on its own.
export const DEFAULT_PIECES = { w: 'p', b: 'p' };
