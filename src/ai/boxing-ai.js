// Minimax opponent for Boxing: searches over macro actions using the pure fight logic.
import { PUNCH, stepFighter, resolveAttack, pushApart } from '../minigames/boxing-logic.js';
import { search, createController, pressedAt } from './minimax.js';
import { DIFFICULTY } from './difficulty.js';

export const ACTIONS = ['idle', 'forward', 'back', 'block', 'punch', 'jumpIn', 'jumpPunch'];
const SIM_DT = 1 / 60;
const PLY = 0.15;                  // about one punch's startup + active window
const PLY_STEPS = Math.round(PLY / SIM_DT);
const AIR_PUNCH_AT = 0.05;         // press punch this long after jumping (< every think interval)
const IDEAL_RANGE = 120;           // centre distance where a punch connects
const other = (c) => (c === 'w' ? 'b' : 'w');

// Input for fighter `c` holding `action`, `since` seconds after it was chosen.
export function actionInput(action, c, fs, since, dt) {
  const me = fs[c], foe = fs[other(c)];
  const fwd = foe.x >= me.x ? 1 : -1;
  const dir = action === 'forward' || action === 'jumpIn' || action === 'jumpPunch' ? fwd : action === 'back' ? -fwd : 0;
  const now = pressedAt(0, since, dt);
  return {
    left: dir < 0, right: dir > 0, block: action === 'block',
    punch: (action === 'punch' && now) || (action === 'jumpPunch' && pressedAt(AIR_PUNCH_AT, since, dt)),
    jump: (action === 'jumpIn' || action === 'jumpPunch') && now,
  };
}

// Advance a copy of both fighters by one ply, in the same order as the real game loop.
export function simulate(s, acts) {
  const n = { w: { ...s.w }, b: { ...s.b }, over: false };
  for (let i = 0; i < PLY_STEPS; i++) {
    const t = i * SIM_DT;
    stepFighter(n.w, actionInput(acts.w, 'w', n, t, SIM_DT), SIM_DT, n.b.x);
    stepFighter(n.b, actionInput(acts.b, 'b', n, t, SIM_DT), SIM_DT, n.w.x);
    pushApart(n.w, n.b);
    resolveAttack(n.w, n.b);
    resolveAttack(n.b, n.w);
    if (n.w.hp === 0 || n.b.hp === 0) {
      n.over = true;
      break;
    }
  }
  return n;
}

export function evaluate(s, c) {
  const me = s[c], foe = s[other(c)];
  if (foe.hp === 0) return 1000 + me.hp;
  if (me.hp === 0) return -1000 - foe.hp;
  let v = 10 * (me.hp - foe.hp);
  const d = Math.abs(me.x - foe.x);
  v -= Math.abs(d - IDEAL_RANGE) * 0.03;
  if (foe.state === 'hit') v += 2;
  if (me.state === 'hit') v -= 2;
  // A whiffed punch leaves us stuck in recovery.
  if (me.state === 'punch' && !me.attackHit && me.t > PUNCH.startup + PUNCH.active) v -= 2;
  return v;
}

// What fighter `c` is visibly doing right now, as one of ACTIONS.
export function currentAction(fs, c) {
  const me = fs[c], foe = fs[other(c)];
  if (me.state === 'block' || me.state === 'blockstun') return 'block';
  if (me.state === 'punch') return 'punch';
  if (me.state === 'airpunch') return 'jumpPunch';
  if (me.state === 'jump') return 'jumpIn';
  if (me.vx === 0) return 'idle';
  return Math.sign(me.vx) === Math.sign(foe.x - me.x) ? 'forward' : 'back';
}

export function decide(fs, c, depth, prev = null, budgetMs) {
  const o = other(c);
  return search({
    state: { w: { ...fs.w }, b: { ...fs.b }, over: false },
    aiActions: ACTIONS,
    foeActions: ACTIONS,
    simulate: (s, a, f) => simulate(s, { [c]: a, [o]: f }),
    evaluate: (s) => evaluate(s, c),
    isOver: (s) => s.over,
    depth,
    budgetMs,
    first: prev,
    rootFoeActions: [currentAction(fs, o)],
  });
}

// Returns (fighters, dt) => input for fighter `color`.
export function createBoxingAI(color, level, { random, budgetMs } = {}) {
  const { depth, think, noise } = DIFFICULTY.boxing[level];
  return createController({
    think, noise, random, actions: ACTIONS,
    decide: (fs, prev) => decide(fs, color, depth, prev, budgetMs),
    toInput: (a, fs, since, dt) => actionInput(a, color, fs, since, dt),
  });
}
