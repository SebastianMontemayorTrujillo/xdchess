import { describe, it, expect } from 'vitest';
import {
  newGame, sanitize, legalMoves as gameMoves, isCapture, resolveCapture, resolveLastChance, gameStatus,
} from '../src/game.js';
import { fromFEN, legalMoves, squareName } from '../src/ai/engine.js';
import { chooseMove, evaluate, MATE } from '../src/ai/search.js';

const allGameMoves = (chess) =>
  chess.board().flat().filter((p) => p && p.color === chess.turn()).flatMap((p) => gameMoves(chess, p.square));

const key = (from, to) => `${from}${to}`;

describe('AI engine matches game rules', () => {
  it('generates exactly the same moves as chess.js over random games', () => {
    let positions = 0;
    for (let game = 0; game < 40; game++) {
      const chess = newGame();
      for (let ply = 0; ply < 80; ply++) {
        const expected = new Set(allGameMoves(chess).filter((m) => !m.promotion || m.promotion === 'q').map((m) => key(m.from, m.to)));
        const actual = new Set(legalMoves(fromFEN(chess.fen())).map((m) => key(squareName(m.from), squareName(m.to))));
        expect(actual).toEqual(expected);
        positions++;
        if (expected.size === 0) break;
        const [from, to] = [...expected][Math.floor(Math.random() * expected.size)].match(/../g);
        chess.move({ from, to, promotion: 'q' });
        sanitize(chess);
      }
    }
    expect(positions).toBeGreaterThan(1000);
  });
});

describe('AI search', () => {
  it('evaluates the start position as roughly equal', () => {
    expect(Math.abs(evaluate(fromFEN(newGame().fen())))).toBeLessThan(10);
  });

  it('finds mate in one', () => {
    // Back-rank mate: Ra1-a8#.
    const m = chooseMove('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { noise: 0 });
    expect(m).toMatchObject({ from: 'a1', to: 'a8' });
    expect(m.score).toBeGreaterThan(MATE / 2);
  });

  it('gambles a pawn on a hanging queen', () => {
    // Pawn e4 can attack the black queen on d5; risking 1 pawn to win 9 is worth it.
    const m = chooseMove('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', { noise: 0 });
    expect(m).toMatchObject({ from: 'e4', to: 'd5' });
  });

  it('does not risk its king on a pawn at even odds', () => {
    // Kxd2 would win a pawn, but losing the fight ends the game.
    const m = chooseMove('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1', { noise: 0 });
    expect(m).not.toMatchObject({ from: 'e1', to: 'd2' });
  });

  it('attacks with the king when it almost always wins fights', () => {
    const m = chooseMove('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1', { noise: 0, pWin: { w: 0.999, b: 0.001 } });
    expect(m).toMatchObject({ from: 'e1', to: 'd2' });
  });

  it('returns a move quickly from the opening at depth 3', () => {
    const t = performance.now();
    const m = chooseMove(newGame().fen(), { depth: 3 });
    expect(m).not.toBeNull();
    expect(performance.now() - t).toBeLessThan(3000);
  });

  it('plays full games against itself with only legal moves', () => {
    for (let g = 0; g < 4; g++) {
      const chess = newGame();
      for (let ply = 0; ply < 300; ply++) {
        if (gameStatus(chess).over) break;
        const choice = chooseMove(chess.fen(), { depth: 2 });
        const move = gameMoves(chess, choice.from).find((m) => m.to === choice.to);
        expect(move).toBeDefined();
        if (!isCapture(move)) {
          chess.move({ from: move.from, to: move.to, promotion: 'q' });
          sanitize(chess);
          continue;
        }
        let r = resolveCapture(chess, move.from, move.to, Math.random() < 0.5);
        while (r.status === 'kingExposed') r = resolveLastChance(chess, r.checkers[0], Math.random() < 0.5);
        if (r.status === 'kingDied') break;
      }
    }
  });

  it('returns null when there are no moves', () => {
    expect(chooseMove('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1')).toBeNull();
  });
});
