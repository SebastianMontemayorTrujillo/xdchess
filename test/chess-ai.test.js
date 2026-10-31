import { describe, it, expect } from 'vitest';
import { chooseMove } from '../src/ai/chess-ai.js';
import { newGame, legalMoves } from '../src/game.js';
import { DIFFICULTY } from '../src/ai/difficulty.js';

const move = (fen, opts) => chooseMove(fen, { random: () => 0.5, ...opts });

describe('chooseMove', () => {
  it('finds mate in one at every depth', () => {
    for (const depth of [1, 2, 3]) {
      expect(move('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth })).toEqual({ from: 'a1', to: 'a8' });
    }
  });

  it('takes a queen with a pawn: worth it even as a coin flip', () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4q3/3P4/8/PPP1PPPP/RNBQKBNR w - - 0 1';
    for (const depth of [1, 2]) expect(move(fen, { depth })).toEqual({ from: 'd4', to: 'e5' });
  });

  it('does not gamble its queen on an undefended pawn', () => {
    // Normal chess says Qxd5 wins a pawn; here the queen dies half the time.
    expect(move('k7/8/8/3p4/8/8/8/3QK3 w - - 0 1', { depth: 1 })).not.toEqual({ from: 'd1', to: 'd5' });
  });

  it('steps out of check instead of risking the king in a fight', () => {
    // Kxe2 would win a rook in normal chess, but a king that loses its fight dies.
    const m = move('k7/8/8/8/8/8/4r3/4K3 w - - 0 1', { depth: 2 });
    expect(m.from).toBe('e1');
    expect(m.to).not.toBe('e2');
  });

  it('returns a legal move from the start position at every difficulty', () => {
    const fen = newGame().fen();
    for (const level of Object.values(DIFFICULTY.chess)) {
      const m = move(fen, level);
      expect(legalMoves(newGame(fen), m.from).some((x) => x.to === m.to)).toBe(true);
    }
  });

  it('respects the time cap and still answers', () => {
    const fen = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 1';
    const t = Date.now();
    const m = move(fen, { depth: 6, timeMs: 300 });
    expect(Date.now() - t).toBeLessThan(1500);
    expect(legalMoves(newGame(fen), m.from).some((x) => x.to === m.to)).toBe(true);
  });

  it('returns null when there are no moves', () => {
    expect(move('7k/5QQ1/8/8/8/8/8/K7 b - - 0 1', { depth: 1 })).toBeNull();
  });
});
