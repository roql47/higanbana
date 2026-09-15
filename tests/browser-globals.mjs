export function mockGlobal(t, key, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, key, original);
    else delete globalThis[key];
  });
}
