// Pure platformer physics: no DOM, so it can be unit-tested.
export const TILE = 24;
export const PW = 16, PH = 20;          // player hitbox
export const RUN = 200;                 // px/s
export const ACCEL = 2400, AIR_ACCEL = 1600;
export const GRAVITY = 2000;            // px/s^2
export const CUT_GRAVITY = 2.5;         // gravity multiplier when rising without holding jump
export const JUMP = 560;                // px/s
export const SPRING = 780;              // px/s launch from a spring
export const MAX_FALL = 900;
export const COYOTE = 0.11, BUFFER = 0.14;
export const CRUMBLE_DELAY = 0.45, CRUMBLE_RESPAWN = 2.5;
export const STEP = 1 / 120;

// Max full-jump height and the widest gap (in tiles) a running jump can clear.
export const MAX_JUMP_PX = (JUMP * JUMP) / (2 * GRAVITY);
export const MAX_CLIMB_TILES = Math.floor(MAX_JUMP_PX / TILE);
export const MAX_GAP_TILES = Math.floor(((2 * JUMP) / GRAVITY * RUN + PW) / TILE);
export const SPRING_PX = (SPRING * SPRING) / (2 * GRAVITY);

// ---- Level: built column by column, top to bottom ----
// '#' ground  'S' spring  'C' crumbling block  '^' spike  'v' ceiling spike  'F' flag
export const ROWS = 10;
function column(ground, { spike = false, ceil = false, flag = false, spring = false, crumbleAt = 0 } = {}) {
  const c = Array(ROWS).fill(' ');
  for (let r = ROWS - ground; r < ROWS; r++) c[r] = '#';
  if (spring) c[ROWS - ground] = 'S';
  if (spike) c[ROWS - ground - 1] = '^';
  if (ceil) c[ROWS - 6] = 'v'; // fixed height: a full jump from the normal floor hits it
  if (crumbleAt) c[ROWS - crumbleAt] = 'C';
  if (flag) c[ROWS - ground - 1] = c[ROWS - ground - 2] = 'F';
  return c;
}
function buildLevel() {
  const cols = [];
  const platforms = [];
  const add = (n, ground, opts) => { for (let i = 0; i < n; i++) cols.push(column(ground, opts)); };
  // A pit crossed by a 2-tile moving platform whose top is `h` tiles above the bottom.
  const movingPit = (n, h, period) => {
    platforms.push({ x0: cols.length, row: ROWS - h, w: 2, range: n - 2, period });
    add(n, 0);
  };
  add(6, 2);                                  // start
  add(3, 0); add(3, 2);                       // first pit
  add(3, 2, { spike: true }); add(2, 2);
  add(2, 3); add(2, 4);                       // stairs up
  add(3, 0); add(1, 4);                       // single pillar
  add(3, 0); add(1, 3);
  add(3, 0); add(3, 2);                       // wide gap
  add(1, 2, { spring: true });                // spring over a pit onto a high ledge
  add(4, 0); add(3, 6); add(2, 0); add(2, 3);
  add(3, 1, { spike: true }); add(1, 3);      // spike pit with pillars
  add(3, 1, { spike: true }); add(1, 3);
  add(4, 1, { spike: true }); add(3, 2);
  movingPit(8, 3, 3); add(3, 2);              // moving platform crossing
  add(3, 2, { ceil: true });                  // low spike ceiling: short hops only
  add(2, 0, { ceil: true });
  add(3, 2, { ceil: true }); add(2, 2);
  add(6, 1, { spike: true, crumbleAt: 3 });   // crumbling bridge over spikes
  add(2, 2);
  add(3, 0); add(2, 2);                       // double gap on narrow ledges
  add(3, 0); add(2, 3);
  add(3, 0); add(1, 4);
  add(2, 0); add(1, 5);                       // climb pillars
  add(2, 0, { crumbleAt: 5 });                // crumbling staircase
  add(2, 0, { crumbleAt: 6 });
  add(2, 0, { crumbleAt: 4 }); add(3, 3);
  add(2, 1, { spike: true }); add(1, 3);
  add(2, 1, { spike: true }); add(1, 4);
  add(2, 1, { spike: true }); add(2, 2);
  add(1, 2, { spring: true });                // spring onto a high moving platform
  movingPit(7, 5, 2.6); add(3, 4);
  add(3, 2, { ceil: true }); add(2, 0, { ceil: true }); add(3, 2, { ceil: true });
  add(3, 2); add(1, 2, { flag: true }); add(4, 2);
  return {
    level: Array.from({ length: ROWS }, (_, r) => cols.map((c) => c[r]).join('')),
    platforms,
  };
}
const built = buildLevel();
export const LEVEL = built.level;
export const PLATFORMS = built.platforms;
export const SPAWN = { x: TILE * 2, y: TILE * (ROWS - 2) - PH };

// Moving platform position (px) at time t: eases back and forth over its range.
export function platformX(pl, t) {
  return (pl.x0 + pl.range * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / pl.period))) * TILE;
}

export const tileAt = (level, col, row) => {
  if (col < 0 || col >= level[0].length) return '#'; // walls at both ends
  if (row < 0 || row >= level.length) return ' ';
  return level[row][col];
};

export function newPlayer() {
  return {
    x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0,
    jumpHeld: false, facing: 1, springing: false, platform: -1, crumble: {},
  };
}

// Crumble state for one block: 'solid' | 'shaking' | 'fallen'.
export function crumbleState(p, col, row, t) {
  const touched = p.crumble[`${col},${row}`];
  if (touched === undefined) return 'solid';
  const age = t - touched;
  if (age < CRUMBLE_DELAY) return 'shaking';
  return 'fallen';
}

const EPS = 0.001;
const overlaps = (level, x, y, w, h, test) => {
  for (let r = Math.floor(y / TILE); r <= Math.floor((y + h - EPS) / TILE); r++)
    for (let c = Math.floor(x / TILE); c <= Math.floor((x + w - EPS) / TILE); c++)
      if (test(tileAt(level, c, r), c, r)) return true;
  return false;
};

/**
 * Advance one fixed step. input = { left, right, jump }; world = { level, platforms, time }.
 * Returns 'jump' | 'spring' | 'land' | 'dead' | 'finish' | null.
 */
export function stepPlayer(p, input, dt, world) {
  const { level, platforms = [], time = 0 } = world;
  const solid = (t, c, r) => t === '#' || t === 'S' || (t === 'C' && crumbleState(p, c, r, time) !== 'fallen');
  let event = null;
  const wasGround = p.onGround, prevVy = p.vy;

  // Respawn fallen crumble blocks once their timer is up (unless the player is inside one).
  for (const key of Object.keys(p.crumble)) {
    if (time - p.crumble[key] < CRUMBLE_DELAY + CRUMBLE_RESPAWN) continue;
    const [c, r] = key.split(',').map(Number);
    const inside = p.x < (c + 1) * TILE && p.x + PW > c * TILE && p.y < (r + 1) * TILE && p.y + PH > r * TILE;
    if (!inside) delete p.crumble[key];
  }

  // Ride the moving platform we're standing on.
  if (p.platform >= 0) {
    const pl = platforms[p.platform];
    p.x += platformX(pl, time) - platformX(pl, time - dt);
  }

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
    p.springing = false;
    event = 'jump';
  }
  p.buffer -= dt;

  if (p.vy >= 0) p.springing = false;
  const cut = p.vy < 0 && !input.jump && !p.springing;
  p.vy = Math.min(MAX_FALL, p.vy + (cut ? GRAVITY * CUT_GRAVITY : GRAVITY) * dt);

  // Horizontal move + collision
  p.x += p.vx * dt;
  if (overlaps(level, p.x, p.y, PW, PH, solid)) {
    const toLeft = Math.floor((p.x + PW - EPS) / TILE) * TILE - PW; // snap out to the left
    const toRight = Math.floor(p.x / TILE + 1) * TILE;               // snap out to the right
    if (p.vx > 0) p.x = toLeft;
    else if (p.vx < 0) p.x = toRight;
    else p.x = p.x - toLeft < toRight - p.x ? toLeft : toRight; // pushed by a platform
    p.vx = 0;
  }
  // Vertical move + collision
  const prevBottom = p.y + PH;
  p.y += p.vy * dt;
  p.onGround = false;
  p.platform = -1;
  if (overlaps(level, p.x, p.y, PW, PH, solid)) {
    if (p.vy > 0) {
      p.y = Math.floor((p.y + PH - EPS) / TILE) * TILE - PH;
      p.onGround = true;
    } else if (p.vy < 0) {
      p.y = Math.floor(p.y / TILE + 1) * TILE;
    }
    p.vy = 0;
  }
  // One-way moving platforms: land only while falling through their top edge.
  if (!p.onGround && p.vy >= 0) {
    platforms.forEach((pl, i) => {
      const top = pl.row * TILE, x = platformX(pl, time);
      if (prevBottom <= top + EPS && p.y + PH >= top && p.x + PW > x && p.x < x + pl.w * TILE) {
        p.y = top - PH;
        p.vy = 0;
        p.onGround = true;
        p.platform = i;
      }
    });
  }

  if (p.onGround) {
    // Mark crumbling blocks we stand on, and launch off springs.
    const row = Math.round((p.y + PH) / TILE);
    let spring = false;
    for (let c = Math.floor(p.x / TILE); c <= Math.floor((p.x + PW - EPS) / TILE); c++) {
      const t = tileAt(level, c, row);
      if (t === 'C' && p.crumble[`${c},${row}`] === undefined) p.crumble[`${c},${row}`] = time;
      if (t === 'S' && p.platform < 0) spring = true;
    }
    if (spring) {
      p.vy = -SPRING;
      p.onGround = false;
      p.springing = true;
      p.coyote = 0;
      event = 'spring';
    } else if (!wasGround && prevVy > 200 && !event) {
      event = 'land';
    }
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
