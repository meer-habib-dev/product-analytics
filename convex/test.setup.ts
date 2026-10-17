// Module map for convex-test. The double-dot filename keeps Convex from deploying it.
// `import.meta.glob` comes from Vitest; it's typed here rather than via a root `vite`
// dependency, which would make `convex dev` treat the repo as a Vite app.
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
