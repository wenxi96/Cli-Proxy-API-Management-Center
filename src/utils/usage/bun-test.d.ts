declare module 'bun:test' {
  export const beforeEach: (nameOrFn: string | (() => void), maybeFn?: () => void) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const expect: (value: unknown) => {
    toBe: (expected: unknown) => void;
    toBeLessThan: (expected: number) => void;
    toBeNull: () => void;
    toBeUndefined: () => void;
    toContain: (expected: unknown) => void;
    not: {
      toBeNull: () => void;
    };
  };
}
