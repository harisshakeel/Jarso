import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// `server-only` throws outside a React Server environment; no-op it for unit tests.
vi.mock("server-only", () => ({}));
