import { describe, it, expect } from 'vitest';
import {
  createState, step, zoneRadius, inZone,
  W, H, R, CRATE, CRATE_HP, COOLDOWN, MAX_HP, ZONE_WAIT, ZONE_SHRINK, ZONE_MIN, ZONE_TICK, TIME_CAP,
} from '../src/minigames/shooter-logic.js';

const DT = 1 / 120;
const run = (s, inputs, secs) => {
  const events = [];
  for (let i = 0; i < secs / DT; i++) events.push(...step(s, typeof inputs === 'function' ? inputs(s) : inputs, DT));
  return events;
};
const open = () => { const s = createState(); s.crates = []; return s; };

describe('water gun logic', () => {
  it('fires toward the opponent position at fire time, then flies straight', () => {
    const s = open();
    s.players.b.y = 100;
    step(s, { w: { fire: true } }, DT);
    const b = s.bullets[0];
    const want = Math.atan2(100 - s.players.w.y, s.players.b.x - s.players.w.x);
    expect(Math.atan2(b.vy, b.vx)).toBeCloseTo(want, 2);
    s.players.b.y = 400; // opponent moves; the bullet must not track
    const v = { vx: b.vx, vy: b.vy };
    step(s, {}, DT);
    expect(s.bullets[0]).toMatchObject(v);
  });

  it('enforces the 300 ms cooldown', () => {
    const s = open();
    const fires = run(s, { w: { fire: true } }, 1).filter((e) => e.type === 'fire');
    expect(fires.length).toBe(Math.floor(1 / COOLDOWN) + 1);
  });

  it('a bullet hit removes 1 HP and knocks back', () => {
    const s = open();
    s.players.b.x = 300;
    const ev = run(s, (st) => ({ w: { fire: st.bullets.length === 0 && st.players.b.hp === MAX_HP } }), 1);
    expect(ev.filter((e) => e.type === 'hit').length).toBe(1);
    expect(s.players.b.hp).toBe(MAX_HP - 1);
    expect(s.players.b.x).toBeGreaterThan(300);
  });

  it('crates block bullets, take damage, and break after CRATE_HP hits', () => {
    const s = createState();
    s.crates = [{ id: 0, x: W / 2, y: H / 2, hp: CRATE_HP }];
    const ev = run(s, { w: { fire: true } }, CRATE_HP * COOLDOWN + 2);
    expect(ev.filter((e) => e.type === 'crateHit').length).toBe(CRATE_HP);
    expect(ev.filter((e) => e.type === 'crateBreak').length).toBe(1);
    expect(s.crates.length).toBe(0);
    // shots after the crate broke reach the opponent
    expect(s.players.b.hp).toBeLessThan(MAX_HP);
  });

  it('players cannot walk through crates', () => {
    const s = createState();
    s.crates = [{ id: 0, x: 200, y: H / 2, hp: CRATE_HP }];
    run(s, { w: { right: true } }, 2);
    expect(s.players.w.x).toBeLessThanOrEqual(200 - CRATE / 2 - R + 0.01);
  });

  it('the zone waits, shrinks, and only hurts outside on its interval', () => {
    expect(zoneRadius(ZONE_WAIT - 1)).toBeGreaterThan(Math.hypot(W / 2, H / 2));
    expect(zoneRadius(ZONE_WAIT + ZONE_SHRINK + 5)).toBe(ZONE_MIN);
    const s = open();
    s.time = ZONE_WAIT + ZONE_SHRINK; // fully shrunk
    s.players.b.x = W / 2; s.players.b.y = H / 2; // b safe in the centre, w at the edge
    expect(inZone(s.players.w, s.time)).toBe(false);
    const ev = run(s, {}, ZONE_TICK * 2 + 0.05);
    expect(ev.filter((e) => e.type === 'zoneHurt' && e.c === 'w').length).toBe(2);
    expect(ev.some((e) => e.type === 'zoneHurt' && e.c === 'b')).toBe(false);
  });

  it('0 HP is a KO; time cap goes to higher HP', () => {
    const s = open();
    s.players.b.hp = 1; s.players.b.x = 300;
    const ev = run(s, { w: { fire: true } }, 1);
    expect(ev.find((e) => e.type === 'ko')).toMatchObject({ winner: 'w', loser: 'b' });
    const t = open();
    t.time = TIME_CAP - DT / 2;
    t.players.w.hp = 2; t.players.b.hp = 3;
    expect(step(t, {}, DT).find((e) => e.type === 'timeUp')).toMatchObject({ winner: 'b' });
  });
});
