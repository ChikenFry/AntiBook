// Prevent Expo 54's winter runtime from crashing Jest.
// The winter runtime installs lazy getters on globalThis (TextDecoder, URL,
// __ExpoImportMetaRegistry, structuredClone, etc.) that call require() when
// first accessed. In jest-runtime 30 without --experimental-vm-modules,
// require() called outside test-code scope throws a ReferenceError.
// We pre-define concrete values for each lazy getter so the lazy require never fires.

const stubs = [
  '__ExpoImportMetaRegistry',
  'TextDecoderStream',
  'TextEncoderStream',
];

for (const name of stubs) {
  if (typeof globalThis[name] === 'undefined') {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: {},
    });
  }
}

// structuredClone is a built-in in Node 17+; only stub when absent.
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}
