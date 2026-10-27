import { describe, it, expect } from 'vitest';
import {
  createFighter, stepFighter, resolveAttack, pushApart, timeUpWinner, airborne,
  PUNCH, AIR_PUNCH, MAX_HP, CHIP, BODY_W,
} from '../src/minigames/boxing-logic.js';

const DT = 1 / 120;
const none = {};
// Step both fighters for `secs`, collecting attack results.
function sim(w, b, inW, inB, secs) {
  const events = [];
  for (let i = 0; i < secs / DT; i++) {
    const t = i * DT;
    stepFighter(w, typeof inW === 'function' ? inW(t) : inW, DT, b.x);
    stepFighter(b, typeof inB === 'function' ? inB(t) : inB, DT, w.x);
    pushApart(w, b);
    for (const [a, d] of [[w, b], [b, w]]) {
      const r = resolveAttack(a, d);
      if (r) events.push(r.type);
    }
  }
  return events;
}
const once = (input) => (t) => (t === 0 ? input : none);

describe('boxing logic', () => {
  it('fighters walk left and right and face each other', () => {
    const w = createFighter('w', 200), b = createFighter('b', 600);
    sim(w, b, { right: true }, { right: true }, 0.5);
    expect(w.x).toBeGreaterThan(300);
    expect(b.x).toBeGreaterThan(600);
    expect(w.facing).toBe(1);
    expect(b.facing).toBe(-1);
  });

  it('a punch in range hits once and deals damage', () => {
    const w = createFighter('w', 300), b = createFighter('b', 300 + BODY_W + 40);
    const ev = sim(w, b, once({ punch: true }), none, 0.5);
    expect(ev).toEqual(['hit']);
    expect(b.hp).toBe(MAX_HP - PUNCH.damage);
  });

  it('a punch out of range whiffs', () => {
    const w = createFighter('w', 200), b = createFighter('b', 600);
    expect(sim(w, b, once({ punch: true }), none, 0.5)).toEqual([]);
    expect(b.hp).toBe(MAX_HP);
  });

  it('blocking reduces damage to chip and pushes back', () => {
    const w = createFighter('w', 300), b = createFighter('b', 300 + BODY_W + 40);
    const x0 = b.x;
    const ev = sim(w, b, once({ punch: true }), { block: true }, 0.5);
    expect(ev).toEqual(['block']);
    expect(b.hp).toBe(MAX_HP - CHIP);
    expect(b.x).toBeGreaterThan(x0);
  });

  it('air punch only works while airborne and hits harder', () => {
    const w = createFighter('w', 300), b = createFighter('b', 420);
    // jump toward, then punch at the apex
    const ev = sim(w, b, (t) => (t === 0 ? { jump: true, right: true } : Math.abs(t - 0.25) < DT / 2 ? { punch: true } : none), none, 1);
    expect(ev).toContain('hit');
    expect(b.hp).toBe(MAX_HP - AIR_PUNCH.damage);
    expect(airborne(w)).toBe(false);
  });

  it('cannot block while in the air', () => {
    const w = createFighter('w', 300), b = createFighter('b', 300 + BODY_W + 40);
    b.state = 'jump'; b.y = 30; b.vy = 1;
    const ev = sim(w, b, once({ punch: true }), { block: true }, 0.3);
    expect(ev[0]).toBe('hit');
  });

  it('reaching 0 HP is a KO; chip damage never KOs', () => {
    const w = createFighter('w', 300), b = createFighter('b', 300 + BODY_W + 40);
    b.hp = 1;
    expect(sim(w, b, once({ punch: true }), { block: true }, 0.4)).toEqual(['block']);
    expect(b.hp).toBe(1);
    expect(sim(w, b, once({ punch: true }), none, 0.4)).toEqual(['ko']);
    expect(b.state).toBe('ko');
  });

  it('bodies cannot overlap; time-up goes to higher HP', () => {
    const w = createFighter('w', 380), b = createFighter('b', 420);
    sim(w, b, { right: true }, { left: true }, 0.5);
    expect(b.x - w.x).toBeGreaterThanOrEqual(BODY_W - 0.01);
    expect(timeUpWinner({ hp: 40 }, { hp: 60 })).toBe('b');
    expect(timeUpWinner({ hp: 50 }, { hp: 50 })).toBe('w');
  });
});
