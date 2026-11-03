// Hermes has no global `crypto`; the polyfill must install expo-crypto's functions so core's
// outbox uuid works on the phone.
jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-4111-8111-111111111111",
  getRandomValues: <T extends ArrayBufferView>(a: T) => a,
}));

describe("crypto polyfill", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "crypto", original);
  });

  test("installs randomUUID and getRandomValues when the engine has no crypto", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    jest.isolateModules(() => {
      require("@/lib/crypto");
    });
    expect(globalThis.crypto.randomUUID()).toBe("11111111-1111-4111-8111-111111111111");
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    jest.isolateModules(() => {
      const { uuid } = require("@jarso/core/offline");
      expect(uuid()).toBe("11111111-1111-4111-8111-111111111111");
    });
  });
});
