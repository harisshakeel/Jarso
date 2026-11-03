/** A grid plan for the parent's Home: CSS grid-template-areas and grid-template-rows values. */
export type FamilyGrid = { areas: string; rows: string };

/**
 * Where each tile sits on the parent's Home for a family of `count` children on a grid of `cols`
 * columns. The child cards come first, row by row; the selected child's graph, history and week
 * then fill whatever the last row of cards leaves empty, so there is never a hole beside a card.
 * The last row is `1fr`, so a tall tile spanning rows (the graph, the week) pushes its extra
 * height into the last row instead of opening a gap under the cards.
 */
export function familyGrid(count: number, cols: 2 | 3): FamilyGrid {
  const cards = Array.from({ length: count }, (_, i) => `c${i}`);
  const full = cards.length - (cards.length % cols);
  const rows: string[][] = [];
  for (let i = 0; i < full; i += cols) rows.push(cards.slice(i, i + cols));
  const fullRows = rows.length;
  const [first = "", second = ""] = cards.slice(full);
  const rest = cards.length - full;

  if (cols === 3 && rest === 1) {
    // One card left: it sits over the history, beside the graph and the week.
    rows.push([first, "graph", "week"], ["history", "graph", "week"]);
  } else if (cols === 3 && rest === 2) {
    // Two cards left: the week takes the third slot and runs down beside the graph.
    rows.push([first, second, "week"], ["graph", "graph", "week"], ["graph", "graph", "history"]);
  } else if (cols === 2 && rest === 1) {
    rows.push([first, "week"], ["graph", "week"], ["graph", "history"]);
  } else if (cols === 3) {
    rows.push(["graph", "graph", "history"], ["graph", "graph", "week"]);
  } else {
    rows.push(["graph", "history"], ["graph", "week"]);
  }

  const tail = rows.length - fullRows;
  return {
    areas: rows.map((row) => `"${row.join(" ")}"`).join(" "),
    rows: [...Array(fullRows + tail - 1).fill("auto"), "1fr"].join(" "),
  };
}
