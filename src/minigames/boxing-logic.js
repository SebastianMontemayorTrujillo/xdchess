// Street-Fighter-style boxing logic: no DOM, so it can be unit-tested.
// Coordinates: x along the arena, y = height above the floor (0 = standing).
export const ARENA_W = 800;
export const BODY_W = 84, BODY_H = 90;
export const MAX_HP = 100;
export const WALK = 230, JUMP = 680, GRAVITY = 1900, FRICTION = 1600;
export const PUNCH = { startup: 0.07, active: 0.09, recovery: 0.16, reach: 75, damage: 7 };
export const AIR_PUNCH = { startup: 0.06, active: 0.3, reach: 70, damage: 10 };
export const HITSTUN = 0.3, BLOCKSTUN = 0.15, CHIP = 1;
export const KNOCKBACK = 300, BLOCK_PUSH = 180;

export function createFighter(color, x) {
  return {
    color, x, y: 0, vx: 0, vy: 0, facing: color === 'w' ? 1 : -1,
    hp: MAX_HP, state: 'idle', t: 0, attackHit: false, airPunchUsed: false,
  };
}

const setState = (f, state) => { f.state = state; f.t = 0; };
export const airborne = (f) => f.y > 0 || f.vy !== 0;

// input = { left, right, block, punch, jump } — punch/jump are "pressed this frame".
export function stepFighter(f, input, dt, opponentX) {
  f.t += dt;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const grounded = !airborne(f);

  if (grounded && ['idle', 'walk', 'block'].includes(f.state)) {
    f.facing = opponentX >= f.x ? 1 : -1;
    if (input.punch) {
      setState(f, 'punch');
      f.attackHit = false;
      f.vx = 0;
    } else if (input.jump) {
      setState(f, 'jump');
      f.vy = JUMP;
      f.vx = dir * WALK;
      f.airPunchUsed = false;
    } else if (input.block) {
      if (f.state !== 'block') setState(f, 'block');
      f.vx = 0;
    } else if (dir) {
      if (f.state !== 'walk') setState(f, 'walk');
      f.vx = dir * WALK;
    } else {
      if (f.state !== 'idle') setState(f, 'idle');
      f.vx = 0;
    }
  } else if (f.state === 'punch') {
    if (f.t >= PUNCH.startup + PUNCH.active + PUNCH.recovery) setState(f, 'idle');
  } else if (f.state === 'jump') {
    if (input.punch && !f.airPunchUsed) {
      setState(f, 'airpunch');
      f.attackHit = false;
      f.airPunchUsed = true;
    }
  } else if (f.state === 'airpunch') {
    if (f.t >= AIR_PUNCH.startup + AIR_PUNCH.active) setState(f, 'jump');
  } else if (f.state === 'hit' || f.state === 'blockstun') {
    if (f.t >= (f.state === 'hit' ? HITSTUN : BLOCKSTUN)) setState(f, 'idle');
  }

  // Friction while stunned or knocked out on the ground
  if (grounded && ['hit', 'blockstun', 'ko'].includes(f.state)) {
    const d = FRICTION * dt;
    f.vx = Math.abs(f.vx) <= d ? 0 : f.vx - Math.sign(f.vx) * d;
  }

  if (airborne(f)) {
    f.vy -= GRAVITY * dt;
    f.y += f.vy * dt;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      if (f.state === 'jump' || f.state === 'airpunch') setState(f, 'idle');
    }
  }
  f.x = Math.max(BODY_W / 2, Math.min(ARENA_W - BODY_W / 2, f.x + f.vx * dt));
}

// Active attack hitbox in world space, or null.
export function attackBox(f) {
  if (f.state === 'punch' && f.t >= PUNCH.startup && f.t < PUNCH.startup + PUNCH.active) {
    const x0 = f.x + f.facing * BODY_W / 2;
    return box(x0, x0 + f.facing * PUNCH.reach, f.y + 45, f.y + 75);
  }
  if (f.state === 'airpunch' && f.t >= AIR_PUNCH.startup) {
    const x0 = f.x + f.facing * 10;
    return box(x0, x0 + f.facing * AIR_PUNCH.reach, f.y - 10, f.y + 50);
  }
  return null;
}
export const hurtBox = (f) => box(f.x - BODY_W / 2, f.x + BODY_W / 2, f.y, f.y + BODY_H);
function box(xa, xb, y0, y1) {
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0, y1 };
}
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Check att's attack against def. Returns null | { type: 'hit'|'block'|'ko', x, y }.
export function resolveAttack(att, def) {
  const hb = attackBox(att);
  if (!hb || att.attackHit || def.state === 'ko') return null;
  const hurt = hurtBox(def);
  if (!overlap(hb, hurt)) return null;
  att.attackHit = true;
  const at = { x: (Math.max(hb.x0, hurt.x0) + Math.min(hb.x1, hurt.x1)) / 2, y: (Math.max(hb.y0, hurt.y0) + Math.min(hb.y1, hurt.y1)) / 2 };
  const facingAttacker = def.facing === Math.sign(att.x - def.x) || att.x === def.x;
  const blocking = (def.state === 'block' || def.state === 'blockstun') && !airborne(def) && facingAttacker;
  if (blocking) {
    def.hp = Math.max(1, def.hp - CHIP); // chip damage never KOs
    setState(def, 'blockstun');
    def.vx = att.facing * BLOCK_PUSH;
    return { type: 'block', ...at };
  }
  def.hp = Math.max(0, def.hp - (att.state === 'airpunch' ? AIR_PUNCH.damage : PUNCH.damage));
  def.vx = att.facing * KNOCKBACK;
  if (def.hp === 0) {
    setState(def, 'ko');
    def.vy = 450;
    return { type: 'ko', ...at };
  }
  setState(def, 'hit');
  return { type: 'hit', ...at };
}

// Keep bodies from overlapping (unless one is clearly above the other).
export function pushApart(a, b) {
  const dx = b.x - a.x;
  const overlapX = BODY_W - Math.abs(dx);
  if (overlapX <= 0 || Math.abs(a.y - b.y) > BODY_H * 0.7) return;
  const s = dx === 0 ? (a.color === 'w' ? 1 : -1) : Math.sign(dx);
  a.x = Math.max(BODY_W / 2, Math.min(ARENA_W - BODY_W / 2, a.x - s * overlapX / 2));
  b.x = Math.max(BODY_W / 2, Math.min(ARENA_W - BODY_W / 2, b.x + s * overlapX / 2));
}

// Time-up winner: more HP wins; a tie goes to White (same convention as the race).
export const timeUpWinner = (w, b) => (b.hp > w.hp ? 'b' : 'w');
