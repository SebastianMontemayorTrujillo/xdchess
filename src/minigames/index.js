import coin from './coin.js';
import boxing from './boxing.js';
import shooter from './shooter.js';

// Each minigame: { id, name, run(container) => Promise<'w' | 'b'> }
// run() mounts into `container` and must remove its own listeners when done.
export const minigames = [coin, boxing, shooter];
