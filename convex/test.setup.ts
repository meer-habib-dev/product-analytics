/// <reference types="vite/client" />
// Module map for convex-test. The double-dot filename keeps Convex from deploying it.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
