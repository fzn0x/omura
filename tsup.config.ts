import { defineConfig } from "tsup";

const tsupConfig = defineConfig({
  entry: ["./src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  clean: true,
  dts: true,
  tsconfig: "./tsconfig.build.json",
});

export default tsupConfig;
