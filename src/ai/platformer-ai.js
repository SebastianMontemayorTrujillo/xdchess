// Minimax opponent for Platform Race. The racers never touch each other, so the opponent
// has a single no-op reply and minimax reduces to a max-only lookahead over the physics.
import { STEP, LEVEL, PLATFORMS, stepPlayer } from '../minigames/platformer-physics.js';
import { search, createController } from './minimax.js';
import { DIFFICULTY } from './difficulty.js';

// [direction, jump held]
export const ACTIONS = [[1, false], [1, true], [0, false], [0, true], [-1, false], [-1, true]];
const PLY = 0.15;
const PLY_STEPS = Math.round(PLY / STEP);
const ROLLOUT = 1; // seconds: how long to follow a mid-air leaf to see where it lands
const DEAD = -1e6, FINISH = 1e6;

const input = ([dir, jump]) => ({ left: dir < 0, right: dir > 0, jump });
const clone = (s) => ({ ...s, p: { ...s.p, crumble: { ...s.p.crumble } } });

// Advance a copy of the race state ({ p, time }) while holding `action`.
// Same order as the game: the clock advances, then the player steps.
export function simulate(s, action, steps = PLY_STEPS) {
  const n = clone(s);
  for (let i = 0; i < steps; i++) {
    n.time += STEP;
    const ev = stepPlayer(n.p, input(action), STEP, { level: LEVEL, platforms: PLATFORMS, time: n.time });
    if (ev === 'dead') return { ...n, dead: true };
    if (ev === 'finish') return { ...n, finished: true };
  }
  return n;
}

export function evaluate(s) {
  if (s.dead) return DEAD;
  if (s.finished) return FINISH - s.time; // sooner is better
  let v = s.p.x;
  if (!s.p.onGround) {
    // Mid-air at the horizon: keep running right until we land, to catch jumps into pits.
    let r = s;
    for (let t = 0; t < ROLLOUT && !r.p.onGround; t += STEP * 6) {
      r = simulate(r, [1, r.p.jumpHeld], 6);
      if (r.dead) return DEAD / 10 + s.p.x;
      if (r.finished) return FINISH / 10;
    }
  } else {
    v += 5;
  }
  return v;
}

export function decide(p, time, depth, prev = null, budgetMs) {
  return search({
    state: clone({ p, time }),
    aiActions: ACTIONS,
    foeActions: [null],
    simulate: (s, a) => simulate(s, a),
    evaluate,
    isOver: (s) => s.dead || s.finished,
    depth,
    budgetMs,
    first: prev,
  });
}

// Returns ({ p, time }, dt) => input for the AI's racer.
export function createPlatformerAI(level, { random, budgetMs } = {}) {
  const { depth, think, noise } = DIFFICULTY.platformer[level];
  return createController({
    think, noise, random, actions: ACTIONS,
    decide: ({ p, time }, prev) => decide(p, time, depth, prev, budgetMs),
    toInput: (a) => input(a),
  });
}
