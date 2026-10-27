// Downloaded online art (see CREDITS.md), loaded once and shared by the minigames.
const BASE = import.meta.env.BASE_URL + 'assets/';
const EFFECTS = ['glove', 'impact', 'sparkle', 'watergun', 'splash', 'heart', 'crate', 'party'];
const PIECES = ['w', 'b'].flatMap((c) => ['K', 'Q', 'R', 'B', 'N', 'P'].map((p) => c + p));

let assetsPromise = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export function loadAssets() {
  if (!assetsPromise) {
    assetsPromise = Promise.all([
      ...EFFECTS.map((n) => loadImage(`${BASE}${n}.svg`)),
      ...PIECES.map((p) => loadImage(`${BASE}pieces/${p}.svg`)),
    ]).then((imgs) => {
      const a = {};
      [...EFFECTS, ...PIECES].forEach((n, i) => (a[n] = imgs[i]));
      return a;
    });
  }
  return assetsPromise;
}

// Sprite for a chess.js piece ({ type, color }).
export const pieceSprite = (assets, piece) => assets[piece.color + piece.type.toUpperCase()];

// cburnett knights face left; callers mirror them so every piece faces "forward".
export const facesLeft = (piece) => piece.type === 'n';

// White silhouette of an image at `size` px, used for hit flashes.
export function silhouette(img, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  return c;
}
