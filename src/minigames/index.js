import coin from './coin.js';
import boxing from './boxing.js';
import shooter from './shooter.js';

// Each minigame: { id, name, run(container, { ai }) => Promise<'w' | 'b'> }
// run() mounts into `container` and must remove its own listeners when done.
// `ai` is the color played by the computer ('w' | 'b'), or null for two humans.
export const minigames = [coin, boxing, shooter];
