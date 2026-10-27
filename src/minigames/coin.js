import { pieceHTML, DEFAULT_PIECES } from '../pieces.js';
import { playSfx } from '../audio.js';

export default {
  id: 'coin',
  name: 'Coin Toss',
  run(container, { pieces = DEFAULT_PIECES } = {}) {
    return new Promise((resolve) => {
      const face = { w: pieceHTML('w', pieces.w), b: pieceHTML('b', pieces.b) };
      container.innerHTML = `
        <div class="big">Coin toss: ${face.w} = Heads, ${face.b} = Tails</div>
        <div class="coin">${face.w}</div>`;
      // Alternate the two faces while the coin spins.
      const coinEl = container.querySelector('.coin');
      let shown = 'w';
      const spin = setInterval(() => {
        shown = shown === 'w' ? 'b' : 'w';
        coinEl.innerHTML = face[shown];
      }, 100);
      const winner = Math.random() < 0.5 ? 'w' : 'b';
      playSfx('coin');
      setTimeout(() => {
        clearInterval(spin);
        container.innerHTML = `<div class="big">${winner === 'w' ? 'Heads' : 'Tails'}!</div><div class="coin-result">${face[winner]}</div>`;
        setTimeout(() => resolve(winner), 900);
      }, 1200);
    });
  },
};
