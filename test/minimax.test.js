import { describe, it, expect } from 'vitest';
import { search, createController, pressedAt } from '../src/ai/minimax.js';

// Toy game: the state is a running score; each ply adds PAYOFF[ai][foe].
const PAYOFF = [[3, -5], [1, 2]];
const toy = (extra = {}) => ({
  state: { score: 0 },
  aiActions: [0, 1],
  foeActions: [0, 1],
  simulate: (s, a, o) => ({ score: s.score + PAYOFF[a][o] }),
  evaluate: (s) => s.score,
  budgetMs: Infinity,
  ...extra,
});

describe('search', () => {
  it('picks the action with the best worst case', () => {
    // Action 0 risks -5; action 1 guarantees at least +1.
    expect(search(toy({ depth: 1 }))).toBe(1);
    expect(search(toy({ depth: 3 }))).toBe(1);
  });

  it('trusts the opponent to keep doing what it does on the first ply', () => {
    // If the foe is committed to 0 right now, action 0 earns +3 immediately.
    expect(search(toy({ depth: 1, rootFoeActions: [0] }))).toBe(0);
  });

  it('works as a single-agent lookahead with a no-op opponent', () => {
    // Walk on a line toward 3; only going right twice reaches it.
    const best = search({
      state: { x: 0 },
      aiActions: [-1, 1],
      foeActions: [null],
      simulate: (s, a) => ({ x: s.x + a }),
      evaluate: (s) => -Math.abs(3 - s.x),
      depth: 2,
      budgetMs: Infinity,
    });
    expect(best).toBe(1);
  });

  it('does not search past terminal states', () => {
    let deepest = 0;
    search(toy({
      depth: 4,
      state: { ply: 0 },
      isOver: () => true,
      simulate: (s) => {
        deepest = Math.max(deepest, s.ply + 1);
        return { ply: s.ply + 1 };
      },
      evaluate: () => 0,
    }));
    expect(deepest).toBe(1); // only the root's children are ever created
  });
});

describe('createController', () => {
  it('re-decides every `think` seconds and holds the action in between', () => {
    let decisions = 0;
    const ctl = createController({
      think: 0.1, noise: 0, actions: ['a'],
      decide: () => (decisions++, 'a'),
      toInput: (a) => a,
    });
    for (let i = 0; i < 30; i++) ctl({}, 0.01); // 0.3 s
    expect(decisions).toBe(3);
  });

  it('plays a random action with probability `noise`', () => {
    const ctl = createController({
      think: 0, noise: 0.5, actions: ['x', 'y'], random: () => 0.25, // < noise, then index 0
      decide: () => 'searched',
      toInput: (a) => a,
    });
    expect(ctl({}, 0.01)).toBe('x');
  });

  it('pressedAt fires on exactly one step', () => {
    const dt = 1 / 60;
    const hits = Array.from({ length: 20 }, (_, i) => pressedAt(0.05, i * dt, dt)).filter(Boolean);
    expect(hits).toHaveLength(1);
  });
});
