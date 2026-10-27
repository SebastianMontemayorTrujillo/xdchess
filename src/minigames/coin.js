export default {
  id: 'coin',
  name: 'Coin Toss',
  run(container) {
    return new Promise((resolve) => {
      container.innerHTML = `<div class="big">Coin toss: White = Heads, Black = Tails</div><div class="coin">🪙</div>`;
      const winner = Math.random() < 0.5 ? 'w' : 'b';
      setTimeout(() => {
        container.innerHTML = `<div class="big">${winner === 'w' ? 'Heads' : 'Tails'}!</div>`;
        setTimeout(() => resolve(winner), 900);
      }, 1200);
    });
  },
};
