// Runs the chess search off the main thread so the page stays responsive while Minimax thinks.
import { chooseMove } from './chess-ai.js';

self.onmessage = (e) => self.postMessage(chooseMove(e.data.fen, e.data.opts));
