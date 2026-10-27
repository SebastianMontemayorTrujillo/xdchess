// Computer opponent settings and a promise wrapper around the search worker.

export const DIFFICULTY = {
  easy: { depth: 2 },
  normal: { depth: 3 },
  hard: { depth: 4 },
};

let worker;

// Resolves with { from, to, promotion } for the side to move, or null if it has no moves.
export function askComputer(fen, options) {
  worker ??= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.postMessage({ fen, options });
  });
}
