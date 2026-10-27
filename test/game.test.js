import { describe, it, expect } from 'vitest';
import { newGame, resolveCapture, resolveLastChance, legalMoves, isCapture, gameStatus } from '../src/game.js';

const field = (chess, i) => chess.fen().split(' ')[i];

describe('resolveCapture', () => {
  // 1.e4 d5: white pawn e4 can capture d5
  const FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 2';

  it('attacker win executes the capture', () => {
    const c = newGame(FEN);
    expect(resolveCapture(c, 'e4', 'd5', true)).toEqual({ status: 'ok' });
    expect(c.get('d5')).toMatchObject({ type: 'p', color: 'w' });
    expect(c.get('e4')).toBeUndefined();
    expect(c.turn()).toBe('b');
  });

  it('defender win removes attacker, keeps defender, passes turn', () => {
    const c = newGame(FEN);
    expect(resolveCapture(c, 'e4', 'd5', false)).toEqual({ status: 'ok' });
    expect(c.get('e4')).toBeUndefined();
    expect(c.get('d5')).toMatchObject({ type: 'p', color: 'b' });
    expect(c.turn()).toBe('b');
    expect(field(c, 5)).toBe('2');
    expect(c.moves().length).toBeGreaterThan(0);
  });

  it('defender win with black attacking increments fullmove', () => {
    const c = newGame('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 2');
    resolveCapture(c, 'd5', 'e4', false);
    expect(c.turn()).toBe('w');
    expect(field(c, 5)).toBe('3');
    expect(c.get('d5')).toBeUndefined();
  });

  it('defender win leaving the next player in check is a normal check', () => {
    // White rook a1 attacks black knight a8; white bishop b5 already checks black king e8.
    const c = newGame('n3k3/8/8/1B6/8/8/8/R3K3 w - - 0 1');
    const r = resolveCapture(c, 'a1', 'a8', false);
    expect(r.status).toBe('ok');
    expect(c.turn()).toBe('b');
    expect(c.inCheck()).toBe(true);
    expect(gameStatus(c).over).toBe(false);
  });

  it('pinned piece capturing a blocker on the pin line keeps the king safe', () => {
    // White rook e2 pinned by black rook e8 captures black knight e5; the knight still blocks.
    const c = newGame('4r1k1/8/8/4n3/8/8/4R3/4K3 w - - 0 1');
    expect(resolveCapture(c, 'e2', 'e5', false)).toEqual({ status: 'ok' });
  });

  it('pinned piece losing against its pinner exposes the king', () => {
    // White rook e2 pinned by black rook e8 captures it; defender wins -> e8 checks e1.
    const c = newGame('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
    const r = resolveCapture(c, 'e2', 'e8', false);
    expect(r).toEqual({ status: 'kingExposed', king: 'e1', checkers: ['e8'] });
    expect(c.turn()).toBe('b');
  });

  it('last chance: king wins removes checker, game continues', () => {
    const c = newGame('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
    resolveCapture(c, 'e2', 'e8', false);
    expect(resolveLastChance(c, 'e8', true)).toEqual({ status: 'ok' });
    expect(c.get('e8')).toBeUndefined();
    expect(c.turn()).toBe('b');
    expect(c.moves().length).toBeGreaterThan(0);
  });

  it('last chance: king loses ends game', () => {
    const c = newGame('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
    resolveCapture(c, 'e2', 'e8', false);
    expect(resolveLastChance(c, 'e8', false)).toEqual({ status: 'kingDied', winner: 'b' });
  });

  it('attacking king that loses dies', () => {
    const c = newGame('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1');
    expect(resolveCapture(c, 'e1', 'd2', false)).toEqual({ status: 'kingDied', winner: 'b' });
  });

  it('attacking king that wins captures normally', () => {
    const c = newGame('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1');
    expect(resolveCapture(c, 'e1', 'd2', true).status).toBe('ok');
    expect(c.get('d2')).toMatchObject({ type: 'k', color: 'w' });
  });

  it('pawn capture onto last rank promotes to queen', () => {
    const c = newGame('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    resolveCapture(c, 'a7', 'b8', true);
    expect(c.get('b8')).toMatchObject({ type: 'q', color: 'w' });
  });
});

describe('simplified rules', () => {
  it('never offers castling', () => {
    const c = newGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(field(c, 2)).toBe('-');
    expect(legalMoves(c, 'e1').some((m) => m.isKingsideCastle() || m.isQueensideCastle())).toBe(false);
  });

  it('never offers en passant', () => {
    const c = newGame();
    for (const m of ['e4', 'a6', 'e5', 'd5']) {
      c.move(m);
      // mimic app: sanitize after each move
      const parts = c.fen().split(' ');
      parts[3] = '-';
      c.load(parts.join(' '));
    }
    expect(legalMoves(c, 'e5').some((m) => m.isEnPassant())).toBe(false);
  });

  it('isCapture detects captures', () => {
    const c = newGame('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 2');
    const moves = legalMoves(c, 'e4');
    expect(moves.find((m) => m.to === 'd5') && isCapture(moves.find((m) => m.to === 'd5'))).toBe(true);
    expect(isCapture(moves.find((m) => m.to === 'e5'))).toBe(false);
  });

  it('checkmate and stalemate', () => {
    expect(gameStatus(newGame('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'))).toMatchObject({ over: true, winner: 'w' });
    expect(gameStatus(newGame('7k/8/6QK/8/8/8/8/8 b - - 0 1'))).toMatchObject({ over: true, winner: null });
  });
});
