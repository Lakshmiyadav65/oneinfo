import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored face-tracking runtime: emscripten glue copied out of
    // node_modules by scripts/vendor-mediapipe.mjs. Not ours to lint, and it
    // trips every rule from require() to a GL call named useProgram.
    "public/mediapipe/**",
  ]),
]);

export default eslintConfig;
