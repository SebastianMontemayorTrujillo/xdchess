// Per-game strength settings for the Minimax opponent.
// depth = plies searched · timeMs = chess thinking-time cap · think = seconds between real-time decisions (reaction delay)
// noise = chance of playing a random action instead of the searched one.
export const LEVELS = ['easy', 'medium', 'hard'];

export const DIFFICULTY = {
  chess: {
    easy: { depth: 1, noise: 0.3, timeMs: 1500 },
    medium: { depth: 2, noise: 0.1, timeMs: 1500 },
    hard: { depth: 3, noise: 0, timeMs: 2500 },
  },
  boxing: {
    easy: { depth: 1, think: 0.45, noise: 0.35 },
    medium: { depth: 2, think: 0.2, noise: 0.12 },
    hard: { depth: 2, think: 0.1, noise: 0 },
  },
  shooter: {
    easy: { depth: 1, think: 0.35, noise: 0.3 },
    medium: { depth: 1, think: 0.2, noise: 0.12 },
    hard: { depth: 2, think: 0.1, noise: 0 },
  },
  platformer: {
    easy: { depth: 2, think: 0.15, noise: 0.08 },
    medium: { depth: 3, think: 0.12, noise: 0.04 },
    hard: { depth: 4, think: 0.08, noise: 0 },
  },
};
