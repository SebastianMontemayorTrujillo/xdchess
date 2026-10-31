// Minimax opponent for Water Gun: searches over movement directions using the pure battle logic.
// Shots auto-aim, so the AI only decides where to move; it holds fire unless a crate is in the way.
import { W, H, R, BULLET_R, CRATE, COOLDOWN, step, zoneRadius } from '../minigames/shooter-logic.js';
import { search, createController } from './minimax.js';
import { DIFFICULTY } from './difficulty.js';

// Movement directions: index 0 = stay, then 8 compass directions.
export const DIRS = [[0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export const ACTIONS = DIRS.map((_, i) => i);
const FOE_ACTIONS = [0, 1, 3, 5, 7]; // stay + 4 cardinal directions keeps the tree small
const SIM_DT = 1 / 30;
const PLY = 0.25;
const PLY_STEPS = Math.round(PLY / SIM_DT);
const IDEAL_RANGE = 250;
const ZONE_LOOKAHEAD = 2; // seconds: start heading in before the zone arrives
const other = (c) => (c === 'w' ? 'b' : 'w');

export const cloneState = (s) => ({
  ...s,
  players: { w: { ...s.players.w }, b: { ...s.players.b } },
  bullets: s.bullets.map((b) => ({ ...b })),
  crates: s.crates.map((c) => ({ ...c })),
});

// Does a crate block the straight line between two points?
export function lineBlocked(crates, a, b) {
  const h = CRATE / 2 + BULLET_R;
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
    if (crates.some((c) => Math.abs(x - c.x) < h && Math.abs(y - c.y) < h)) return true;
  }
  return false;
}

export function actionInput(action, c, state) {
  const [dx, dy] = DIRS[action];
  const me = state.players[c], foe = state.players[other(c)];
  return { up: dy < 0, down: dy > 0, left: dx < 0, right: dx > 0, fire: !lineBlocked(state.crates, me, foe) };
}

export function simulate(s, acts) {
  const n = cloneState(s);
  for (let i = 0; i < PLY_STEPS && !n.winner; i++) {
    step(n, { w: actionInput(acts.w, 'w', n), b: actionInput(acts.b, 'b', n) }, SIM_DT);
  }
  return n;
}

// How badly bullets from `owner` are about to hit `p`: sum over bullets on a collision course.
function threat(s, owner, p) {
  let t = 0;
  for (const b of s.bullets) {
    if (b.owner !== owner) continue;
    const rx = p.x - b.x, ry = p.y - b.y, v2 = b.vx * b.vx + b.vy * b.vy;
    const when = (rx * b.vx + ry * b.vy) / v2; // seconds until closest approach
    if (when < 0 || when > 1) continue;
    const miss = Math.hypot(rx - b.vx * when, ry - b.vy * when);
    if (miss < R + BULLET_R + 4) t += 1 - when;
  }
  return t;
}

export function evaluate(s, c) {
  const o = other(c), me = s.players[c], foe = s.players[o];
  if (s.winner) return s.winner === c ? 1000 + me.hp : -1000 - foe.hp;
  let v = 20 * (me.hp - foe.hp);
  const zr = zoneRadius(s.time + ZONE_LOOKAHEAD);
  const outside = (p) => Math.max(0, Math.hypot(p.x - W / 2, p.y - H / 2) - zr + R);
  v -= 0.05 * outside(me) - 0.05 * outside(foe);
  v -= 8 * threat(s, o, me) - 6 * threat(s, c, foe);
  v -= 0.01 * Math.abs(Math.hypot(me.x - foe.x, me.y - foe.y) - IDEAL_RANGE);
  // While reloading, being behind cover is worth something.
  if (s.time - me.last < COOLDOWN && lineBlocked(s.crates, me, foe)) v += 2;
  return v;
}

// Nearest DIRS index to a movement delta (0 when standing still).
export function directionOf(dx, dy) {
  if (Math.hypot(dx, dy) < 1) return 0;
  const a = Math.atan2(dy, dx); // DIRS[3] = +x, DIRS[5] = +y
  return 1 + ((Math.round(a / (Math.PI / 4)) + 2 + 8) % 8);
}

export function decide(state, c, depth, prev = null, foeAction = 0, budgetMs) {
  const o = other(c);
  return search({
    state: cloneState(state),
    aiActions: ACTIONS,
    foeActions: FOE_ACTIONS,
    rootFoeActions: [foeAction],
    simulate: (s, a, f) => simulate(s, { [c]: a, [o]: f }),
    evaluate: (s) => evaluate(s, c),
    isOver: (s) => Boolean(s.winner),
    depth,
    budgetMs,
    first: prev,
  });
}

// Returns (state, dt) => input for player `color`.
export function createShooterAI(color, level, { random, budgetMs } = {}) {
  const { depth, think, noise } = DIFFICULTY.shooter[level];
  let seen = null; // foe position at the last decision, to see which way it is moving
  return createController({
    think, noise, random, actions: ACTIONS,
    decide: (state, prev) => {
      const foe = state.players[other(color)];
      const foeAction = seen ? directionOf(foe.x - seen.x, foe.y - seen.y) : 0;
      seen = { x: foe.x, y: foe.y };
      return decide(state, color, depth, prev, foeAction, budgetMs);
    },
    toInput: (a, state) => actionInput(a, color, state),
  });
}
