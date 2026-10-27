// Pure platformer physics: no DOM, so it can be unit-tested.
export const TILE = 24;
export const PW = 16, PH = 20;          // player hitbox
export const RUN = 200;                 // px/s
export const ACCEL = 2400, AIR_ACCEL = 1600;
export const GRAVITY = 2000;            // px/s^2
export const CUT_GRAVITY = 2.5;         // gravity multiplier when rising without holding jump
export const JUMP = 560;                // px/s
export const MAX_FALL = 900;
export const COYOTE = 0.11, BUFFER = 0.14;
export const STEP = 1 / 120;

// Max full-jump height and the widest gap (in tiles) a running jump can clear.
export const MAX_JUMP_PX = (JUMP * JUMP) / (2 * GRAVITY);
export const MAX_CLIMB_TILES = Math.floor(MAX_JUMP_PX / TILE);
export const MAX_GAP_TILES = Math.floor(((2 * JUMP) / GRAVITY * RUN + PW) / TILE);

// ---- Level: built column by column (9 rows, top to bottom) ----
export const ROWS = 9;
function column(ground, { spike = false, ceiling = -1, flag = false } = {}) {
  const c = Array(ROWS).fill(' ');
  for (let r = ROWS - ground; r < ROWS; r++) c[r] = '#';
  if (spike) c[ROWS - ground - 1] = '^';
  if (ceiling >= 0) c[ceiling] = 'v';
  if (flag) c[ROWS - ground - 1] = c[ROWS - ground - 2] = 'F';
  return c;
}
function buildLevel() {
  const cols = [];
  const add = (n, ground, opts) => { for (let i = 0; i < n; i++) cols.push(column(ground, opts)); };
  add(6, 2);                       // start
  add(3, 0); add(3, 2);            // first pit
  add(3, 2, { spike: true }); add(2, 2);
  add(2, 3); add(2, 4);            // stairs up
  add(3, 0); add(1, 4);            // single pillar
  add(3, 0); add(1, 3);
  add(3, 0); add(3, 2);            // wide gap
  add(3, 1, { spike: true }); add(1, 3);   // spike pit with pillars
  add(3, 1, { spike: true }); add(1, 3);
  add(4, 1, { spike: true }); add(3, 2);
  add(3, 2, { ceiling: 3 });       // low spike ceiling: short hops only
  add(2, 0, { ceiling: 3 });
  add(3, 2, { ceiling: 3 });
  add(2, 2);
  add(3, 0); add(2, 2);            // double gap on narrow ledges
  add(3, 0); add(2, 3);
  add(3, 0); add(1, 4);
  add(2, 0); add(1, 5);            // climb pillars
  add(3, 0); add(1, 3);            // drop
  add(2, 1, { spike: true }); add(1, 3);
  add(2, 1, { spike: true }); add(1, 4);
  add(2, 1, { spike: true }); add(1, 3);
  add(2, 1, { spike: true }); add(2, 2);
  add(1, 2, { spike: true }); add(1, 2); add(1, 2, { spike: true }); add(1, 2);
  add(2, 2, { spike: true }); add(1, 2); add(3, 0); add(2, 3);
  add(3, 2, { ceiling: 3 }); add(2, 0, { ceiling: 3 }); add(3, 2, { ceiling: 3 });
  add(3, 2); add(1, 2, { flag: true }); add(4, 2);
  return Array.from({ length: ROWS }, (_, r) => cols.map((c) => c[r]).join(''));
}
export const LEVEL = buildLevel();
export const SPAWN = { x: TILE * 2, y: TILE * (ROWS - 2) - PH };

export const tileAt = (level, col, row) => {
  if (col < 0 || col >= level[0].length) return '#'; // walls at both ends
  if (row < 0 || row >= level.length) return ' ';
  return level[row][col];
};

export function newPlayer() {
  return { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, jumpHeld: false, facing: 1 };
}

const EPS = 0.001;
const overlaps = (level, x, y, w, h, test) => {
  for (let r = Math.floor(y / TILE); r <= Math.floor((y + h - EPS) / TILE); r++)
    for (let c = Math.floor(x / TILE); c <= Math.floor((x + w - EPS) / TILE); c++)
      if (test(tileAt(level, c, r), c, r)) return true;
  return false;
};
const solid = (t) => t === '#';

// Advance one fixed step. input = { left, right, jump }.
// Returns 'jump' | 'dead' | 'finish' | null.
export function stepPlayer(p, input, dt, level) {
  let event = null;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) p.facing = dir;
  const accel = (p.onGround ? ACCEL : AIR_ACCEL) * dt;
  const target = dir * RUN;
  p.vx = p.vx < target ? Math.min(target, p.vx + accel) : Math.max(target, p.vx - accel);

  if (input.jump && !p.jumpHeld) p.buffer = BUFFER;
  p.jumpHeld = input.jump;
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -JUMP;
    p.buffer = p.coyote = 0;
    event = 'jump';
  }
  p.buffer -= dt;

  const g = p.vy < 0 && !input.jump ? GRAVITY * CUT_GRAVITY : GRAVITY;
  p.vy = Math.min(MAX_FALL, p.vy + g * dt);

  // Horizontal move + collision
  p.x += p.vx * dt;
  if (overlaps(level, p.x, p.y, PW, PH, solid)) {
    if (p.vx > 0) p.x = Math.floor((p.x + PW - EPS) / TILE) * TILE - PW;
    else if (p.vx < 0) p.x = Math.floor(p.x / TILE + 1) * TILE;
    p.vx = 0;
  }
  // Vertical move + collision
  p.y += p.vy * dt;
  p.onGround = false;
  if (overlaps(level, p.x, p.y, PW, PH, solid)) {
    if (p.vy > 0) {
      p.y = Math.floor((p.y + PH - EPS) / TILE) * TILE - PH;
      p.onGround = true;
    } else if (p.vy < 0) {
      p.y = Math.floor(p.y / TILE + 1) * TILE;
    }
    p.vy = 0;
  }
  p.coyote = p.onGround ? COYOTE : p.coyote - dt;

  // Hazards use a slightly smaller box to be forgiving.
  const hx = p.x + 4, hy = p.y + 4, hw = PW - 8, hh = PH - 8;
  if (p.y > level.length * TILE) return 'dead';
  if (overlaps(level, hx, hy, hw, hh, (t, c, r) => {
    if (t === '^') return hy + hh > r * TILE + TILE / 2;  // spike: bottom half of tile
    if (t === 'v') return hy < r * TILE + TILE / 2;       // ceiling spike: top half
    return false;
  })) return 'dead';
  if (overlaps(level, p.x, p.y, PW, PH, (t) => t === 'F')) return 'finish';
  return event;
}

// Winner when time runs out: furthest best progress, then fewer deaths, then White.
export function raceWinner(w, b) {
  if (w.best !== b.best) return w.best > b.best ? 'w' : 'b';
  if (w.deaths !== b.deaths) return w.deaths < b.deaths ? 'w' : 'b';
  return 'w';
}
