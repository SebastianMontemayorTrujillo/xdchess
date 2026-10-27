import { newGame, sanitize, legalMoves, isCapture, resolveCapture, resolveLastChance, gameStatus } from './game.js';
import { renderBoard, pieceName } from './board.js';
import { spinRoulette, flash } from './roulette.js';
import { playMusic, stopMusic, toggleMute } from './audio.js';

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');
const colorName = (c) => (c === 'w' ? 'White' : 'Black');

let chess, selected, targets, over, busy;

function start() {
  // `?fen=` loads a custom start position (for testing).
  const fen = new URLSearchParams(location.search).get('fen');
  chess = fen ? newGame(fen) : newGame();
  selected = null;
  targets = [];
  over = null;
  busy = false;
  render();
}

function render() {
  renderBoard(boardEl, chess, { selected, targets, onSquare });
  if (over) statusEl.textContent = over;
  else {
    const s = gameStatus(chess);
    if (s.over) {
      over = s.winner ? `Checkmate — ${colorName(s.winner)} wins!` : 'Stalemate — draw.';
      statusEl.textContent = over;
    } else {
      statusEl.textContent = `${colorName(chess.turn())} to move${s.check ? ' — CHECK!' : ''}`;
    }
  }
}

function onSquare(square) {
  if (over || busy) return;
  const move = targets.find((m) => m.to === square);
  if (move) {
    selected = null;
    targets = [];
    if (isCapture(move)) fight(move.from, move.to);
    else {
      chess.move({ from: move.from, to: move.to, promotion: 'q' });
      sanitize(chess);
      render();
    }
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

// fighters: { w: piece, b: piece } — the two pieces in this fight, by colour.
async function playMinigame(title, fighters) {
  overlay.hidden = false;
  const game = await spinRoulette(overlay, title);
  overlay.innerHTML = '';
  playMusic(game.id);
  const winner = await game.run(overlay, fighters);
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
  over = `${colorName(chess.turn())} resigns — ${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins!`;
  render();
});
document.getElementById('new').addEventListener('click', () => !busy && start());
document.getElementById('mute').addEventListener('click', (e) => {
  e.target.textContent = toggleMute() ? '🔇' : '🔊';
});

start();
