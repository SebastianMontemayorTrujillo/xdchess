import { minigames } from './minigames/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Spin over the registry and resolve with the chosen minigame.
// `?game=<id>` in the URL forces a specific minigame (for testing).
export async function spinRoulette(container, title) {
  const forced = new URLSearchParams(location.search).get('game');
  const pickIdx = Math.max(0, minigames.findIndex((g) => g.id === forced));
  const target = forced ? pickIdx : Math.floor(Math.random() * minigames.length);

  container.innerHTML = `<div class="big">${title}</div>`;
  const items = minigames.map((g) => {
    const d = document.createElement('div');
    d.className = 'roulette-item';
    d.textContent = g.name;
    container.appendChild(d);
    return d;
  });

  const steps = minigames.length * 3 + target;
  let delay = 60;
  for (let i = 0; i <= steps; i++) {
    items.forEach((d, j) => d.classList.toggle('on', j === i % minigames.length));
    await sleep(delay);
    delay *= 1.12;
  }
  await sleep(700);
  return minigames[target];
}

// Show a message in the overlay for `ms` milliseconds.
export async function flash(container, html, ms = 1500) {
  container.innerHTML = html;
  await sleep(ms);
}
