import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
  // The shared protocol package is internal to the monorepo, so it's bundled in.
  noExternal: ["@analytics/shared"],
  external: ["react-native", "expo-application", "expo-device", "react-native-mmkv"],
});
