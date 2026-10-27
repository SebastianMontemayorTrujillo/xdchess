import { newGame, sanitize, legalMoves, isCapture, resolveCapture, resolveLastChance, gameStatus } from './game.js';
import { renderBoard, pieceName } from './board.js';
import { spinRoulette, flash } from './roulette.js';
import { askComputer, DIFFICULTY } from './ai/index.js';

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');
const modeEl = document.getElementById('mode');
const colorName = (c) => (c === 'w' ? 'White' : 'Black');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AI_COLOR = 'b'; // in vs Computer mode the human plays White

let chess, selected, targets, over, busy, thinking;
let ai;         // computer's color, or null in 2-player mode
let aiRecord;   // the computer's minigame results this game: { wins, fights }

function start() {
  // `?fen=` loads a custom start position (for testing).
  const fen = new URLSearchParams(location.search).get('fen');
  chess = fen ? newGame(fen) : newGame();
  selected = null;
  targets = [];
  over = null;
  busy = false;
  thinking = false;
  ai = modeEl.value === 'human' ? null : AI_COLOR;
  aiRecord = { wins: 0, fights: 0 };
  render();
  computerTurn();
}

// Chance the computer wins a minigame, learned from this game's results
// (starts at 50% and moves toward the real win rate as fights happen).
function minigameOdds() {
  const p = (aiRecord.wins + 2) / (aiRecord.fights + 4);
  return ai === 'w' ? { w: p, b: 1 - p } : { w: 1 - p, b: p };
}

async function computerTurn() {
  if (!ai || over || chess.turn() !== ai || gameStatus(chess).over) return;
  busy = true;
  thinking = true;
  render();
  const options = { ...DIFFICULTY[modeEl.value], pWin: minigameOdds() };
  const [choice] = await Promise.all([askComputer(chess.fen(), options), sleep(500)]);
  thinking = false;

  // Trust chess.js over the AI's own move generator; fall back to any legal move.
  const legal = legalMoves(chess, choice?.from).find((m) => m.to === choice?.to)
    ?? chess.moves({ verbose: true }).find((m) => !m.isEnPassant());
  if (isCapture(legal)) {
    await fight(legal.from, legal.to);
    return;
  }
  chess.move({ from: legal.from, to: legal.to, promotion: 'q' });
  sanitize(chess);
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
    } else if (thinking) {
      statusEl.textContent = 'Computer is thinking…';
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
      computerTurn();
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

async function playMinigame(title) {
  overlay.hidden = false;
  const game = await spinRoulette(overlay, title);
  overlay.innerHTML = '';
  const winner = await game.run(overlay, { ai });
  if (ai) {
    aiRecord.fights++;
    if (winner === ai) aiRecord.wins++;
  }
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
  const winner = await playMinigame(`${pieceName(attacker)} attacks ${pieceName(defender)}`);
  let result = resolveCapture(chess, from, to, winner === attacker.color);

  // A defender victory may expose the attacker's king: it gets a last-chance fight per checker.
  while (result.status === 'kingExposed') {
    render();
    const king = chess.get(result.king);
    const checkerSq = result.checkers[0];
    const checker = chess.get(checkerSq);
    const w = await playMinigame(`LAST CHANCE! ${pieceName(king)} vs ${pieceName(checker)}`);
    result = resolveLastChance(chess, checkerSq, w === king.color);
  }
  if (result.status === 'kingDied') over = `${colorName(result.winner === 'w' ? 'b' : 'w')}'s king has fallen — ${colorName(result.winner)} wins!`;
  busy = false;
  render();
  computerTurn();
}

document.getElementById('resign').addEventListener('click', () => {
  if (over || busy) return;
  over = `${colorName(chess.turn())} resigns — ${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins!`;
  render();
});
document.getElementById('new').addEventListener('click', () => !busy && start());
modeEl.addEventListener('change', () => !busy && start());

start();
