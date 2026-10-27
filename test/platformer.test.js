import { describe, it, expect } from 'vitest';
import {
  TILE, PH, STEP, ROWS, LEVEL, SPAWN, MAX_CLIMB_TILES, MAX_GAP_TILES,
  newPlayer, stepPlayer, raceWinner,
} from '../src/minigames/platformer-physics.js';

// Helpers
const flat = (cols, rows = ROWS) => Array.from({ length: rows }, (_, r) => (r >= rows - 2 ? '#' : ' ').repeat(cols));
const run = (p, level, inputFn, seconds) => {
  const events = [];
  for (let i = 0; i < seconds / STEP; i++) {
    const ev = stepPlayer(p, inputFn(i * STEP, p), STEP, level);
    if (ev) events.push(ev);
    if (ev === 'dead' || ev === 'finish') break;
  }
  return events;
};
const settle = (p, level) => run(p, level, () => ({}), 0.3);

describe('platformer physics', () => {
  it('player spawns standing on the ground', () => {
    const p = newPlayer();
    settle(p, LEVEL);
    expect(p.onGround).toBe(true);
    expect(p.y).toBeCloseTo(SPAWN.y, 5);
  });

  it('full jump reaches the expected height; a tap jump is much lower', () => {
    const level = flat(20);
    const p = newPlayer(); settle(p, level);
    const start = p.y;
    let top = start;
    run(p, level, (t, pl) => { top = Math.min(top, pl.y); return { jump: true }; }, 0.6);
    const fullHeight = start - top;
    expect(fullHeight).toBeGreaterThan(MAX_CLIMB_TILES * TILE);

    const q = newPlayer(); settle(q, level);
    let qTop = q.y;
    run(q, level, (t, pl) => { qTop = Math.min(qTop, pl.y); return { jump: t < 0.03 }; }, 0.6);
    expect(start - qTop).toBeLessThan(fullHeight * 0.6);
  });

  it('a running jump clears a gap of the widest size used in the level', () => {
    const gap = 4;
    const level = flat(30).map((row, r) =>
      r >= ROWS - 2 ? row.slice(0, 10) + ' '.repeat(gap) + row.slice(10 + gap) : row);
    const p = newPlayer(); settle(p, level);
    const edge = 10 * TILE;
    const events = run(p, level, (t, pl) => ({ right: true, jump: pl.x + 14 >= edge }), 3);
    expect(events).not.toContain('dead');
    expect(p.x).toBeGreaterThan((10 + gap) * TILE);
    expect(p.onGround).toBe(true);
  });

  it('falling into a pit or touching a spike kills; the flag finishes', () => {
    const pit = flat(20).map((row, r) => (r >= ROWS - 2 ? row.slice(0, 4) + ' '.repeat(16) : row));
    expect(run(newPlayer(), pit, () => ({ right: true }), 5)).toContain('dead');

    const spikes = flat(20).map((row, r) => (r === ROWS - 3 ? row.slice(0, 6) + '^' + row.slice(7) : row));
    expect(run(newPlayer(), spikes, () => ({ right: true }), 3)).toContain('dead');

    const flag = flat(20).map((row, r) => (r === ROWS - 3 ? row.slice(0, 8) + 'F' + row.slice(9) : row));
    expect(run(newPlayer(), flag, () => ({ right: true }), 3)).toContain('finish');
  });
});

describe('race level is beatable', () => {
  // A column is standable if its top solid tile has no spike on it.
  const surface = (col) => {
    for (let r = 0; r < ROWS; r++) {
      const t = LEVEL[r][col];
      if (t === '^') return null;
      if (t === '#') return ROWS - r; // height in tiles
    }
    return null;
  };

  it('every gap and climb is within jump reach', () => {
    let lastHeight = surface(0);
    let gap = 0;
    for (let col = 1; col < LEVEL[0].length; col++) {
      const h = surface(col);
      if (h === null) { gap++; continue; }
      expect(gap, `gap before column ${col}`).toBeLessThanOrEqual(MAX_GAP_TILES - 1);
      expect(h - lastHeight, `climb at column ${col}`).toBeLessThanOrEqual(MAX_CLIMB_TILES - 1);
      lastHeight = h;
      gap = 0;
    }
  });

  it('has exactly one finish flag, reachable after the start', () => {
    const flags = LEVEL.join('').split('F').length - 1;
    expect(flags).toBe(2); // a two-tile-tall flag
    expect(LEVEL.every((row) => row.length === LEVEL[0].length)).toBe(true);
    expect(PH).toBeLessThan(TILE);
  });
});

describe('raceWinner (time limit)', () => {
  it('furthest best progress wins', () => {
    expect(raceWinner({ best: 500, deaths: 9 }, { best: 300, deaths: 0 })).toBe('w');
    expect(raceWinner({ best: 300, deaths: 0 }, { best: 500, deaths: 9 })).toBe('b');
  });
  it('equal progress: fewer deaths wins; full tie goes to White', () => {
    expect(raceWinner({ best: 400, deaths: 3 }, { best: 400, deaths: 1 })).toBe('b');
    expect(raceWinner({ best: 400, deaths: 2 }, { best: 400, deaths: 2 })).toBe('w');
  });
});
