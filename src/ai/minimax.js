// Depth-limited minimax for the real-time minigames.
// One ply = the AI and its opponent each hold an action for a slice of simulated time.
// Moves are really simultaneous; we approximate that as "AI commits, opponent answers
// with its worst-case reply" (paranoid minimax), which keeps the AI cautious.
// On the first ply the opponent can't have reacted yet (nobody reacts within one ply),
// so it keeps doing what it is visibly doing; without that, every attack looks answerable
// and the AI never commits to one.

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * search({ state, aiActions, foeActions, rootFoeActions, simulate, evaluate, isOver, depth, budgetMs, first })
 *   aiActions / foeActions: arrays of actions (foeActions = [null] for a single-agent search)
 *   rootFoeActions: the opponent's options on the first ply (defaults to foeActions)
 *   simulate(state, aiAction, foeAction) → new state (must not mutate `state`)
 *   evaluate(state) → score from the AI's point of view (higher is better)
 *   first: action to try first (better alpha-beta pruning)
 * Deepens one ply at a time; if the time budget runs out, the last finished depth decides.
 */
export function search({ state, aiActions, foeActions, rootFoeActions = foeActions, simulate, evaluate, isOver = () => false, depth, budgetMs = 10, first = null }) {
  const deadline = now() + budgetMs;
  let timedOut = false;

  // MIN node: the opponent's worst-case reply to AI action `a`.
  const reply = (s, a, d, alpha, beta, replies = foeActions) => {
    let worst = Infinity;
    for (const o of replies) {
      worst = Math.min(worst, value(simulate(s, a, o), d - 1, alpha, beta));
      if (worst <= alpha) break; // this `a` can't beat what we already have
    }
    return worst;
  };

  // MAX node: the AI's best action.
  const value = (s, d, alpha, beta) => {
    if (d === 0 || isOver(s)) return evaluate(s);
    if (now() > deadline) {
      timedOut = true;
      return evaluate(s);
    }
    let best = -Infinity;
    for (const a of aiActions) {
      best = Math.max(best, reply(s, a, d, Math.max(alpha, best), beta));
      if (best >= beta) break;
    }
    return best;
  };

  // Depth 1 only evaluates leaves, so it always finishes and gives a fallback answer.
  let result = first !== null && aiActions.includes(first) ? first : aiActions[0];
  for (let d = 1; d <= depth; d++) {
    const order = [result, ...aiActions.filter((a) => a !== result)];
    let bestAction = order[0], bestValue = -Infinity;
    for (const a of order) {
      const v = reply(state, a, d, bestValue, Infinity, rootFoeActions);
      if (timedOut) break;
      if (v > bestValue) {
        bestValue = v;
        bestAction = a;
      }
    }
    if (timedOut) break;
    result = bestAction;
  }
  return result;
}

/**
 * Wrap a decision function into a per-step input source for a minigame loop.
 *   decide(state, previousAction) → action      (usually a `search` call)
 *   toInput(action, state, since, dt) → input   (since = seconds since the decision)
 * Re-decides every `think` seconds and holds the action in between (reaction delay);
 * with probability `noise` a random action is played instead.
 */
export function createController({ think, noise, actions, decide, toInput, random = Math.random }) {
  let action = null, since = Infinity;
  return (state, dt) => {
    if (since >= think) {
      action = random() < noise ? actions[Math.floor(random() * actions.length)] : decide(state, action);
      since = 0;
    }
    const input = toInput(action, state, since, dt);
    since += dt;
    return input;
  };
}

// True on the single step where `at` seconds after the decision is crossed.
export const pressedAt = (at, since, dt) => since <= at && at < since + dt;
