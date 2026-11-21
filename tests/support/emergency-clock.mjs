// Process-local test clock. Set only for worker or browser tests that need a
// synthetic teaching day, with normal argument-based Date construction intact.
const value = process.env.SLOTWISE_TEST_NOW;
if (value) {
  const now = Date.parse(value);
  if (!Number.isFinite(now)) throw new Error("Invalid emergency test clock");
  const NativeDate = Date;
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
    static parse(value) { return NativeDate.parse(value); }
    static UTC(...args) { return NativeDate.UTC(...args); }
  };
}
