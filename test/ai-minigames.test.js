import { describe, it, expect } from 'vitest';
import { createFighter, stepFighter, resolveAttack, pushApart } from '../src/minigames/boxing-logic.js';
import { createState, step } from '../src/minigames/shooter-logic.js';
import { STEP as PF_STEP, LEVEL, PLATFORMS, newPlayer, stepPlayer } from '../src/minigames/platformer-physics.js';
import { createBoxingAI } from '../src/ai/boxing-ai.js';
import { createShooterAI, directionOf, DIRS } from '../src/ai/shooter-ai.js';
import { createPlatformerAI } from '../src/ai/platformer-ai.js';

// Deterministic Math.random replacement for the AIs' noise.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Generous search budget: results shouldn't depend on how busy the test machine is.
const opts = (seed = 1) => ({ random: seeded(seed), budgetMs: 200 });
const idle = () => ({});

// Same order as boxing.js's update(), without hit-stop.
function box(wCtl, bCtl, seconds = 60) {
  const STEP = 1 / 120;
  const f = { w: createFighter('w', 220), b: createFighter('b', 580) };
  for (let t = 0; t < seconds && f.w.hp > 0 && f.b.hp > 0; t += STEP) {
    stepFighter(f.w, wCtl(f, STEP), STEP, f.b.x);
    stepFighter(f.b, bCtl(f, STEP), STEP, f.w.x);
    pushApart(f.w, f.b);
    resolveAttack(f.w, f.b);
    resolveAttack(f.b, f.w);
  }
  return f;
}

function shoot(wCtl, bCtl) {
  const STEP = 1 / 120;
  const s = createState();
  while (!s.winner) step(s, { w: wCtl(s, STEP), b: bCtl(s, STEP) }, STEP);
  return s;
}

// Same as platformer.js's stepRace(): dying restarts you, best progress counts.
function race(ctl, seconds = 40) {
  let p = { ...newPlayer(), best: 0 }, time = 0;
  while (time < seconds) {
    time += PF_STEP;
    const input = ctl({ p, time }, PF_STEP);
    const ev = stepPlayer(p, input, PF_STEP, { level: LEVEL, platforms: PLATFORMS, time });
    if (ev === 'dead') Object.assign(p, newPlayer(), { jumpHeld: input.jump });
    if (ev === 'finish') return { finished: true, best: Infinity };
    p.best = Math.max(p.best, p.x);
  }
  return { finished: false, best: p.best };
}

describe('boxing AI', () => {
  it('knocks out an idle opponent at every level', () => {
    for (const level of ['easy', 'medium', 'hard']) {
      const f = box(idle, createBoxingAI('b', level, opts()));
      expect(f.w.hp, level).toBe(0);
    }
  });

  it('hard beats easy', () => {
    const f = box(createBoxingAI('w', 'easy', opts(1)), createBoxingAI('b', 'hard', opts(2)));
    expect(f.b.hp).toBeGreaterThan(f.w.hp);
  });
});

describe('shooter AI', () => {
  it('beats an idle opponent at every level', () => {
    for (const level of ['easy', 'medium', 'hard']) {
      expect(shoot(idle, createShooterAI('b', level, opts())).winner, level).toBe('b');
    }
  });

  it('beats a stationary opponent that never stops shooting', () => {
    expect(shoot(() => ({ fire: true }), createShooterAI('w', 'hard', opts())).winner).toBe('w');
  });

  it('maps movement deltas to directions', () => {
    for (let i = 1; i < DIRS.length; i++) expect(directionOf(DIRS[i][0] * 10, DIRS[i][1] * 10)).toBe(i);
    expect(directionOf(0.1, 0)).toBe(0);
  });
});

describe('platformer AI', () => {
  const holdRight = race(() => ({ right: true }));

  it('hard finishes the course', () => {
    expect(race(createPlatformerAI('hard', opts())).finished).toBe(true);
  });

  it('easy gets much further than holding right', () => {
    expect(race(createPlatformerAI('easy', opts())).best).toBeGreaterThan(holdRight.best * 3);
  });
});
