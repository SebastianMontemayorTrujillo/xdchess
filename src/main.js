import {
  newGame, sanitize, legalMoves, isCapture, resolveCapture, resolveLastChance, gameStatus, findKing,
} from './game.js';
import { renderBoard } from './board.js';
import { pieceName } from './pieces.js';
import { spinRoulette, flash } from './roulette.js';
import { askComputer, DIFFICULTY } from './ai/index.js';
import { playSfx, playMusic, isMuted, setMuted } from './audio.js';

const boardEl = document.getElementById('board');
const board3dEl = document.getElementById('board3d');
const viewEl = document.getElementById('view');
const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');
const modeEl = document.getElementById('mode');
const muteEl = document.getElementById('mute');
const colorName = (c) => (c === 'w' ? 'White' : 'Black');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AI_COLOR = 'b'; // in vs Computer mode the human plays White

let chess, selected, targets, over, busy, thinking;
let ai;         // computer's color, or null in 2-player mode
let aiRecord;   // the computer's minigame results this game: { wins, fights }
let checkSoundFen; // position the check sound last played for, so it plays once per check

// Board view: '3d' (default) or '2d', remembered between visits.
const VIEW_KEY = 'crabchess.view';
let view = readView();
let board3d = null; // 3D board, loaded the first time 3D view is used

// Board animations: the 3D board's, or instant no-ops in 2D view.
const NO_ANIMATION = {
  slideMove: async () => {},
  focusFight: async () => {},
  knockOut: async () => {},
  resetCamera: async () => {},
};
const fx = () => (view === '3d' && board3d) || NO_ANIMATION;

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === '2d' ? '2d' : '3d';
  } catch {
    return '3d';
  }
}

async function setView(next) {
  if (next === '3d' && !board3d) {
    try {
      const { createBoard3D } = await import('./board3d/board3d.js');
      board3dEl.hidden = false; // must be visible so the canvas can size itself
      board3d = createBoard3D(board3dEl);
    } catch (err) {
      console.warn('3D board unavailable, using 2D:', err);
      next = '2d';
      viewEl.hidden = true;
    }
  }
  view = next;
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // storage unavailable: the choice just won't be remembered
  }
  boardEl.hidden = view === '3d';
  board3dEl.hidden = view !== '3d';
  board3d?.setActive(view === '3d');
  viewEl.textContent = view === '3d' ? '2D view' : '3D view';
  render();
}

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
  checkSoundFen = null;
  playMusic('board');
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
  if (isCapture(legal)) await fight(legal.from, legal.to);
  else await quietMove(legal.from, legal.to);
}

// A non-capture move: animate it, then apply it.
async function quietMove(from, to) {
  busy = true;
  render(); // clears the move markers before the piece slides
  await fx().slideMove(from, to);
  chess.move({ from, to, promotion: 'q' });
  sanitize(chess);
  playSfx('move');
  busy = false;
  render();
}

// Ends the game; `winner` is 'w', 'b' or null for a draw.
function endGame(text, winner) {
  over = text;
  if (!winner) playSfx('pick'); // draw
  else playSfx(!ai || winner !== ai ? 'win' : 'lose'); // in 2-player mode someone always wins
}

function render() {
  if (view === '3d' && board3d) board3d.render(chess, { selected, targets, onSquare });
  else renderBoard(boardEl, chess, { selected, targets, onSquare });
  if (over) statusEl.textContent = over;
  else {
    const s = gameStatus(chess);
    if (s.over) {
      endGame(s.winner ? `Checkmate — ${colorName(s.winner)} wins!` : 'Stalemate — draw.', s.winner);
      statusEl.textContent = over;
    } else if (thinking) {
      statusEl.textContent = 'Computer is thinking…';
    } else {
      statusEl.textContent = `${colorName(chess.turn())} to move${s.check ? ' — CHECK!' : ''}`;
    }
    if (s.check && !s.over && chess.fen() !== checkSoundFen) {
      checkSoundFen = chess.fen();
      playSfx('check');
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
    else quietMove(move.from, move.to).then(computerTurn);
    return;
  }
  const piece = chess.get(square);
  if (piece && piece.color === chess.turn()) {
    selected = square;
    targets = legalMoves(chess, square);
    playSfx('select');
  } else {
    selected = null;
    targets = [];
  }
  render();
}

// `a` and `b` are the two fighting pieces ({ type, color }), one of each color.
async function playMinigame(a, b, title) {
  board3d?.setActive(false); // the minigame covers the board; give it the full frame budget
  overlay.hidden = false;
  playMusic('fight');
  const game = await spinRoulette(overlay, title);
  overlay.innerHTML = '';
  const winner = await game.run(overlay, { ai, pieces: { [a.color]: a.type, [b.color]: b.type } });
  if (ai) {
    aiRecord.fights++;
    if (winner === ai) aiRecord.wins++;
  }
  await flash(overlay, `<div class="big">${colorName(winner)} wins the ${game.name}!</div>`);
  overlay.hidden = true;
  overlay.innerHTML = '';
  board3d?.setActive(view === '3d');
  playMusic('board');
  return winner;
}

async function fight(from, to) {
  busy = true;
  render();
  const attacker = chess.get(from);
  const defender = chess.get(to);
  await fx().focusFight(from, to);
  const winner = await playMinigame(attacker, defender, `${pieceName(attacker)} attacks ${pieceName(defender)}`);
  const attackerWon = winner === attacker.color;
  playSfx(attackerWon ? 'capture' : 'removed');
  if (attackerWon) {
    await fx().knockOut(to);
    await fx().slideMove(from, to);
  } else {
    await fx().knockOut(from);
  }
  let result = resolveCapture(chess, from, to, attackerWon);

  // A defender victory may expose the attacker's king: it gets a last-chance fight per checker.
  while (result.status === 'kingExposed') {
    render();
    const king = chess.get(result.king);
    const checkerSq = result.checkers[0];
    const checker = chess.get(checkerSq);
    await fx().focusFight(result.king, checkerSq);
    const w = await playMinigame(king, checker, `LAST CHANCE! ${pieceName(king)} vs ${pieceName(checker)}`);
    if (w === king.color) playSfx('capture');
    await fx().knockOut(w === king.color ? checkerSq : result.king);
    result = resolveLastChance(chess, checkerSq, w === king.color);
  }
  await fx().resetCamera();
  if (result.status === 'kingDied') {
    const loser = result.winner === 'w' ? 'b' : 'w';
    chess.remove(findKing(chess, loser)); // the fallen king leaves the board
    endGame(`${colorName(loser)}'s king has fallen — ${colorName(result.winner)} wins!`, result.winner);
  }
  busy = false;
  render();
  computerTurn();
}

document.getElementById('resign').addEventListener('click', () => {
  if (over || busy) return;
  const winner = chess.turn() === 'w' ? 'b' : 'w';
  endGame(`${colorName(chess.turn())} resigns — ${colorName(winner)} wins!`, winner);
  render();
});
document.getElementById('new').addEventListener('click', () => !busy && start());
modeEl.addEventListener('change', () => !busy && start());

viewEl.addEventListener('click', () => !busy && setView(view === '3d' ? '2d' : '3d'));

const showMute = () => { muteEl.textContent = isMuted() ? '🔇' : '🔊'; };
muteEl.addEventListener('click', () => {
  setMuted(!isMuted());
  showMute();
});
showMute();

boardEl.hidden = view === '3d'; // avoid flashing the 2D board while 3D loads
start();
setView(view);
