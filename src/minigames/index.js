import coin from './coin.js';
import boxing from './boxing.js';
import shooter from './shooter.js';
import platformer from './platformer.js';

// Each minigame: { id, name, run(container, fighters) => Promise<'w' | 'b'> }
// fighters = { w: piece, b: piece } (chess.js pieces) for the two combatants.
// run() mounts into `container` and must remove its own listeners when done.
export const minigames = [coin, boxing, shooter, platformer];
