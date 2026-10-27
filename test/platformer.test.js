import { describe, it, expect } from 'vitest';
import {
  TILE, PW, PH, STEP, ROWS, LEVEL, PLATFORMS, SPAWN, MAX_CLIMB_TILES, MAX_GAP_TILES, MAX_JUMP_PX, SPRING_PX,
  RUN, GRAVITY, SPRING, CRUMBLE_DELAY, CRUMBLE_RESPAWN,
  newPlayer, stepPlayer, raceWinner, platformX, crumbleState,
} from '../src/minigames/platformer-physics.js';

// Helpers
const flat = (cols, rows = ROWS) => Array.from({ length: rows }, (_, r) => (r >= rows - 2 ? '#' : ' ').repeat(cols));
// `world` may be a bare level (array of rows) or { level, platforms }. Time continues across calls.
const run = (p, world, inputFn, seconds) => {
  const w = Array.isArray(world) ? { level: world, platforms: [] } : world;
  const events = [];
  for (let i = 0; i < seconds / STEP; i++) {
    p.t = (p.t ?? 0) + STEP;
    const ev = stepPlayer(p, inputFn(i * STEP, p), STEP, { ...w, time: p.t });
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

describe('springs, moving platforms, crumbling blocks', () => {
  // flat ground with a custom tile placed at the surface of column `col`
  const withTile = (cols, col, ch, row = ROWS - 2) =>
    flat(cols).map((line, r) => (r === row ? line.slice(0, col) + ch + line.slice(col + 1) : line));

  it('a spring launches much higher than a jump', () => {
    const level = withTile(20, 5, 'S');
    const p = newPlayer(); settle(p, level);
    const start = p.y;
    let top = start;
    const ev = run(p, level, (t, pl) => { top = Math.min(top, pl.y); return { right: pl.x < 5 * TILE + 4 }; }, 2);
    expect(ev).toContain('spring');
    expect(start - top).toBeGreaterThan(MAX_JUMP_PX * 1.5);
    expect(SPRING_PX).toBeGreaterThan(MAX_JUMP_PX * 1.5);
  });

  it('the level spring carries a running player over its pit onto the high ledge', () => {
    const springCol = LEVEL[ROWS - 2].indexOf('S');
    const p = newPlayer();
    p.x = (springCol - 3) * TILE;
    settle(p, LEVEL);
    const ev = run(p, LEVEL, () => ({ right: true }), 1.2);
    expect(ev).toContain('spring');
    expect(ev).not.toContain('dead');
    expect(p.onGround).toBe(true);
    expect(p.y + PH).toBe((ROWS - 6) * TILE); // on top of the 6-high ledge
  });

  it('a standing player rides a moving platform', () => {
    const pl = { x0: 4, row: ROWS - 4, w: 2, range: 6, period: 4 };
    const world = { level: flat(20).map((l, r) => (r >= ROWS - 2 ? '#'.repeat(3) + ' '.repeat(14) + '###' : l)), platforms: [pl] };
    const p = newPlayer();
    p.x = platformX(pl, 0) + 4;
    p.y = pl.row * TILE - PH - 2;
    p.t = 0;
    run(p, world, () => ({}), 0.1);
    expect(p.onGround).toBe(true);
    const offset = p.x - platformX(pl, p.t);
    run(p, world, () => ({}), 1);
    expect(p.x - platformX(pl, p.t)).toBeCloseTo(offset, 3);
    expect(p.y + PH).toBeCloseTo(pl.row * TILE, 5);
  });

  it('moving platforms are one-way: you can jump up through them', () => {
    const pl = { x0: 3, row: ROWS - 4, w: 4, range: 0.0001, period: 100 };
    const world = { level: flat(20), platforms: [pl] };
    const p = newPlayer(); p.x = 4 * TILE; settle(p, world);
    run(p, world, (t) => ({ jump: t < 0.5 }), 1.2);
    expect(p.onGround).toBe(true);
    expect(p.y + PH).toBeCloseTo(pl.row * TILE, 5);
  });

  it('crumbling blocks fall after a delay, come back later, and reset on respawn', () => {
    // a single crumble block over a pit
    const level = flat(12).map((l, r) => (r >= ROWS - 2 ? '#'.repeat(5) + ' '.repeat(7) : r === ROWS - 3 ? ' '.repeat(6) + 'C' + ' '.repeat(5) : l));
    const p = newPlayer();
    p.x = 6 * TILE + 4;
    p.y = (ROWS - 3) * TILE - PH - 1;
    p.t = 0;
    run(p, level, () => ({}), 0.05);
    expect(p.onGround).toBe(true);
    run(p, level, () => ({}), CRUMBLE_DELAY - 0.1);
    expect(crumbleState(p, 6, ROWS - 3, p.t)).toBe('shaking');
    expect(p.onGround).toBe(true);
    const ev = run(p, level, () => ({}), 1);
    expect(ev).toContain('dead'); // fell into the pit
    expect(crumbleState(p, 6, ROWS - 3, p.t)).toBe('fallen');
    expect(crumbleState(p, 6, ROWS - 3, p.t + CRUMBLE_RESPAWN + 0.01)).toBe('fallen'); // only cleared by a step
    const q = newPlayer();
    expect(crumbleState(q, 6, ROWS - 3, p.t)).toBe('solid');
  });
});

describe('race level is beatable', () => {
  // Height (tiles) of the standable top surface of a column, or null for pits and spikes.
  const surface = (col) => {
    for (let r = 0; r < ROWS; r++) {
      const t = LEVEL[r][col];
      if (t === '^') return null;
      if (t === '#' || t === 'S' || t === 'C') return ROWS - r;
    }
    const pl = PLATFORMS.find((p) => col >= p.x0 && col < p.x0 + p.range + p.w);
    return pl ? ROWS - pl.row : null;
  };
  // A spring launch reaches higher and further than a jump.
  const SPRING_CLIMB = Math.floor(SPRING_PX / TILE) - 1;
  const SPRING_GAP = Math.floor(((2 * SPRING) / GRAVITY * RUN * 0.8 + PW) / TILE);

  it('every gap and climb is within jump (or spring) reach', () => {
    let lastHeight = surface(0);
    let lastSpring = false;
    let gap = 0;
    for (let col = 1; col < LEVEL[0].length; col++) {
      const h = surface(col);
      if (h === null) { gap++; continue; }
      const maxGap = lastSpring ? SPRING_GAP : MAX_GAP_TILES - 1;
      const maxClimb = lastSpring ? SPRING_CLIMB : MAX_CLIMB_TILES - 1;
      expect(gap, `gap before column ${col}`).toBeLessThanOrEqual(maxGap);
      expect(h - lastHeight, `climb at column ${col}`).toBeLessThanOrEqual(maxClimb);
      lastHeight = h;
      lastSpring = LEVEL[ROWS - h][col] === 'S';
      gap = 0;
    }
  });

  it('uses every new gadget', () => {
    const all = LEVEL.join('');
    expect(all).toContain('S');
    expect(all).toContain('C');
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(2);
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
