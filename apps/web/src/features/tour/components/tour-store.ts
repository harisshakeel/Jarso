// "Show me around again" (Me) starts the tour from anywhere: the tour lives in the child layout,
// so a button elsewhere asks it to start through this tiny store.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Asks the welcome tour to start again from the first step. */
export function startTour(): void {
  for (const listener of listeners) listener();
}

export function onTourStart(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
