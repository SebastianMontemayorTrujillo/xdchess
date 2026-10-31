import { newGame, sanitize, legalMoves, isCapture, resolveCapture, resolveLastChance, gameStatus } from './game.js';
import { renderBoard, pieceName } from './board.js';
import { spinRoulette, flash } from './roulette.js';
import { playMusic, stopMusic, toggleMute } from './audio.js';
import { DIFFICULTY, LEVELS } from './ai/difficulty.js';

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');
const overlay = document.getElementById('overlay');
const colorName = (c) => (c === 'w' ? 'White' : 'Black');
const other = (c) => (c === 'w' ? 'b' : 'w');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = { w: 'W/A/S/D, X', b: 'I/J/K/L, M' };
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

let chess, selected, targets, over, busy, thinking;
// null = two players on one keyboard; otherwise { color, difficulty } of the side Minimax plays.
let mode = null;
const choice = { human: 'w', difficulty: 'medium' }; // last picks on the start screen

const aiToMove = () => Boolean(mode) && !over && chess.turn() === mode.color;

function showMenu() {
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="menu">
      <div class="big">🦀 Crab Chess</div>
      <div>Every capture is settled by a minigame.</div>
      <div class="menu-modes">
        <button data-act="friend">👥 Play vs Friend</button>
        <button data-act="minimax">🤖 Play vs Minimax</button>
      </div>
      <div class="menu-ai" hidden>
        <div class="menu-row"><span>You play</span>
          <button data-human="w">♔ White</button><button data-human="b">♚ Black</button></div>
        <div class="menu-row"><span>Difficulty</span>
          ${LEVELS.map((l) => `<button data-level="${l}">${capitalize(l)}</button>`).join('')}</div>
        <button class="menu-start" data-act="start">Start ▶</button>
      </div>
    </div>`;
  const menu = overlay.querySelector('.menu');
  const sync = () => {
    for (const b of menu.querySelectorAll('[data-human]')) b.classList.toggle('on', b.dataset.human === choice.human);
    for (const b of menu.querySelectorAll('[data-level]')) b.classList.toggle('on', b.dataset.level === choice.difficulty);
  };
  sync();
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.human) choice.human = b.dataset.human;
    if (b.dataset.level) choice.difficulty = b.dataset.level;
    if (b.dataset.act === 'friend') start(null);
    if (b.dataset.act === 'minimax') {
      menu.querySelector('.menu-ai').hidden = false;
      b.classList.add('on');
    }
    if (b.dataset.act === 'start') start({ color: other(choice.human), difficulty: choice.difficulty });
    sync();
  });
}

function start(newMode) {
  mode = newMode;
  overlay.hidden = true;
  overlay.innerHTML = '';
  // `?fen=` loads a custom start position (for testing).
  const fen = new URLSearchParams(location.search).get('fen');
  chess = fen ? newGame(fen) : newGame();
  selected = null;
  targets = [];
  over = null;
  busy = false;
  thinking = false;
  if (mode) {
    const you = other(mode.color);
    helpEl.textContent = `You = ${colorName(you)} (${KEYS[you]}) · 🤖 Minimax (${mode.difficulty}) = ${colorName(mode.color)}. Every capture is settled by a minigame.`;
  } else {
    helpEl.textContent = `White = Player 1 (${KEYS.w}) · Black = Player 2 (${KEYS.b}). Every capture is settled by a minigame.`;
  }
  render();
  nextTurn();
}

function render() {
  renderBoard(boardEl, chess, { selected, targets, onSquare, flipped: mode?.color === 'w' });
  if (over) statusEl.textContent = over;
  else {
    const s = gameStatus(chess);
    if (s.over) {
      over = s.winner ? `Checkmate — ${colorName(s.winner)} wins!` : 'Stalemate — draw.';
      statusEl.textContent = over;
    } else {
      statusEl.textContent = `${colorName(chess.turn())} to move${s.check ? ' — CHECK!' : ''}${thinking ? ' — 🤖 Minimax is thinking…' : ''}`;
    }
  }
}

function onSquare(square) {
  if (over || busy || aiToMove()) return;
  const move = targets.find((m) => m.to === square);
  if (move) {
    selected = null;
    targets = [];
    playMove(move);
    return;
  }
  const piece = chess.get(square);
  if (piece && piece.color === chess.turn()) {
    selected = square;
    targets = legalMoves(chess, square);
  } else {
    selected = null;
    targets = [];
  }
  render();
}

async function playMove(move) {
  if (isCapture(move)) await fight(move.from, move.to);
  else {
    chess.move({ from: move.from, to: move.to, promotion: 'q' });
    sanitize(chess);
    render();
  }
  nextTurn();
}

function nextTurn() {
  if (aiToMove()) aiTurn();
}

// The chess search runs in a worker; if workers are unavailable, search on the main thread.
let worker;
function askMinimax(fen, opts) {
  return new Promise((resolve) => {
    const fallback = () => import('./ai/chess-ai.js').then((m) => resolve(m.chooseMove(fen, opts)));
    try {
      worker ??= new Worker(new URL('./ai/chess-worker.js', import.meta.url), { type: 'module' });
    } catch {
      fallback();
      return;
    }
    worker.onmessage = (e) => resolve(e.data);
    worker.onerror = () => {
      worker = null;
      fallback();
    };
    worker.postMessage({ fen, opts });
  });
}

async function aiTurn() {
  busy = thinking = true;
  render();
  // A short minimum think so the reply doesn't appear before the human's move registers.
  const [pick] = await Promise.all([askMinimax(chess.fen(), DIFFICULTY.chess[mode.difficulty]), sleep(500)]);
  busy = thinking = false;
  const move = pick && legalMoves(chess, pick.from).find((m) => m.to === pick.to);
  if (move) await playMove(move);
  else render();
}

// fighters: { w: piece, b: piece } — the two pieces in this fight, by colour.
async function playMinigame(title, fighters) {
  overlay.hidden = false;
  const game = await spinRoulette(overlay, title);
  overlay.innerHTML = '';
  playMusic(game.id);
  const winner = await game.run(overlay, fighters, { ai: mode });
  stopMusic();
  await flash(overlay, `<div class="big">${colorName(winner)} wins the ${game.name}!</div>`);
  overlay.hidden = true;
  overlay.innerHTML = '';
  return winner;
}

async function fight(from, to) {
  busy = true;
  render();
  const attacker = chess.get(from);
  const defender = chess.get(to);
  const winner = await playMinigame(`${pieceName(attacker)} attacks ${pieceName(defender)}`, {
    [attacker.color]: attacker,
    [defender.color]: defender,
  });
  let result = resolveCapture(chess, from, to, winner === attacker.color);

  // A defender victory may expose the attacker's king: it gets a last-chance fight per checker.
  while (result.status === 'kingExposed') {
    render();
    const king = chess.get(result.king);
    const checkerSq = result.checkers[0];
    const checker = chess.get(checkerSq);
    const w = await playMinigame(`LAST CHANCE! ${pieceName(king)} vs ${pieceName(checker)}`, {
      [king.color]: king,
      [checker.color]: checker,
    });
    result = resolveLastChance(chess, checkerSq, w === king.color);
  }
  if (result.status === 'kingDied') over = `${colorName(result.winner === 'w' ? 'b' : 'w')}'s king has fallen — ${colorName(result.winner)} wins!`;
  busy = false;
  render();
}

document.getElementById('resign').addEventListener('click', () => {
  if (over || busy) return;
  const loser = mode ? other(mode.color) : chess.turn();
  over = `${colorName(loser)} resigns — ${colorName(other(loser))} wins!`;
  render();
});
document.getElementById('new').addEventListener('click', () => !busy && showMenu());
document.getElementById('mute').addEventListener('click', (e) => {
  e.target.textContent = toggleMute() ? '🔇' : '🔊';
});

showMenu();
