// Server-only API of the tour feature. Never import from Client Components.
import "server-only";

export { getTour, saveMyTour, welcomeTourOn } from "./service";
