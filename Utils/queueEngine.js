// Pure queue-placement logic. No database, no I/O, so it is easy to test.
// A waiting line is an array of tickets in service order, e.g. [{ category: 'R' }, ...]
// category: 'R' = regular, 'S' = senior citizen / PWD

/**
 * Where should a new ticket be inserted in the waiting line?
 *
 * Regular  -> always the back.
 * Priority -> find the last priority ticket still waiting (or the front if none),
 *             skip the first regular ticket after it, insert right behind that regular.
 *             If there is no regular to skip, go to the back.
 *
 * Only tickets still waiting are passed in, so called/served customers never
 * affect the pattern.
 *
 * @returns {number} index at which to insert (0..waiting.length)
 */
export function insertionIndex(waiting, category) {
  if (category !== 'S') return waiting.length;

  let lastS = -1;
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (waiting[i].category === 'S') { lastS = i; break; }
  }
  for (let i = lastS + 1; i < waiting.length; i++) {
    if (waiting[i].category === 'R') return i + 1;
  }
  return waiting.length;
}

/** Returns a new array with the ticket placed per the rules. */
export function enqueue(waiting, ticket) {
  const idx = insertionIndex(waiting, ticket.category);
  return [...waiting.slice(0, idx), ticket, ...waiting.slice(idx)];
}

/** Next ticket to call is always the head of the shared line. */
export function nextToCall(waiting) {
  return waiting.length ? waiting[0] : null;
}
