import { chooseMove } from './search.js';

// Runs the search off the main thread so the page stays responsive.
self.onmessage = (e) => self.postMessage(chooseMove(e.data.fen, e.data.options));
