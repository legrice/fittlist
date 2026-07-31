// The poster tints for events with no flyer: warm paper colours the ink
// stays readable on, in either theme. Keyed on the id so a card doesn't
// change clothes between visits. One list, because the board and the home
// rails must agree on what an event looks like.
const POSTER_TINTS = ["#f2e3cf", "#dfe8d4", "#e6e0f0", "#f6ded6", "#dbe8ec", "#f0e0e8"];

export const posterTint = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return POSTER_TINTS[h % POSTER_TINTS.length];
};
